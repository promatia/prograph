import queryParser from './queryParser.js'
import schemaParser from './schemaParser.js'
import GraphError from './GraphError.js'
import costAnalyser from './costAnalyser.js'
import * as defaultScalars from './defaultScalars.js'
import Directive from './directive.js'

const defaultSchema = `
scalar Number
scalar String
scalar Boolean

directive cost(
    cost: Number
    multiplyParent: Boolean
    multipliers: [String]
) INPUT FIELD OBJECT
directive deprecated(reason: String) INPUT FIELD OBJECT
`

export default function Builder ({
    schema,
    messageResolvers = {},
    directiveResolvers = {},
    scalarResolvers = {},
    defaultCost = 0
}) {
    schema += defaultSchema

    const {
        types,
        scalarTypes,
        subscriptions,
        messages,
        directives,
        paginators
    } = schemaParser(schema)

    scalarTypes.push('Number', 'String', 'Boolean')

    Object.assign(scalarResolvers, defaultScalars)

    directiveResolvers.cost = class Cost extends Directive { }
    directiveResolvers.deprecated = class Deprecated extends Directive { }

    let mergedTypes = { ...types, ...paginators }

    //expand types recursively (circularly)
    for (let name in mergedTypes) {
        let type = mergedTypes[name]
        for (let fieldName in type.fields) {
            expandField(type.fields[fieldName], `${name}.${fieldName}`)
        }
    }

    let mergedMessageTypes = { ...subscriptions, ...messages }


    for (let name in mergedMessageTypes) {
        let message = mergedMessageTypes[name]
        Object.assign(message, expandField(message, name))
        for (let inputName in message.inputs) {
            expandField(message.inputs[inputName], `${name}.${inputName}`)
        }
    }

    checkForMissing(scalarTypes, 'scalar', scalarResolvers)
    checkForMissing(Object.keys(messages), 'message', messageResolvers)
    checkForMissing(Object.keys(directives), 'directive', directiveResolvers)

    return async function graph (queryString, { context = {}, max = 1000 } = {}) {
        let queries = queryParser(queryString)
        let returnObject = {}
        compareItems(queries)
        costAnalyser(queries, mergedMessageTypes, max, defaultCost)

        for (let i in queries) {
            let want = queries[i]
            let name = want.name
            let resolver = messageResolvers[name]
            let schema = mergedMessageTypes[name]

            returnObject[name] = await resolveWant(resolver, want, schema, name)
        }

        return returnObject
        
        async function resolveInput (input, schema, path) {
            let directives = schema.directives
            let i = 0

            async function value () {
                if (directives[i]) { //if there are directives still left, then call them
                    let { args, name } = directives[i++]
                    let directive = new directiveResolvers[name]
                    return await directive.inputVisitor({name, context, value: await value(), args})
                }
                //check scalar type or nested type (array,object)
                if(schema.type === 'type') {
                    return await resolveInputs(input, schema.inputs, path)
                }

                if(schema.type === 'array') {
                    let promises = []
                    
                    for(let i in input) {
                        promises.push(resolveInput(input[i], schema.array, `${path}.${i}`))
                    }
                    
                    return await Promise.all(promises)
                }

                let ScalarClass = new scalarResolvers[schema.scalar]
                return await ScalarClass.incoming(input)
            }

            return nullWrapper(await value(), schema, path)
        }

        async function resolveInputs (inputs, schemas, parent) {
            let promises = []
            
            for (let name in inputs) {
                let path = `${parent}.${name}`
                let input = inputs[name]
                let schema = schemas[name]
                let promise = resolveInput(input, schema, path)
                    .then(val => inputs[name] = val)
                    .catch(err => {
                        throw new GraphError(err, path)
                    })

                promises.push(promise)
            }
    
            await Promise.all(promises)
        }

        function wrapField (value) {
            if(typeof value === 'function') return value
            return () => value
        }

        async function resolveWant (resolverOrValue, want, schema, path) {
            let directives = schema.directives
            let i = 0
            let resolver = wrapField(resolverOrValue)
            let inputs = want.inputs
            let wants = want.wants
            await resolveInputs(inputs, schema.inputs, path)

            async function value () {
                if (directives[i]) {
                    let { args, name } = directives[i++]
                    let directive = new directiveResolvers[name]
                    return await directive.fieldVisitor({wants, name, args, inputs, context, value})
                }

                if(schema.type === 'type') {
                    let fields = await resolver(inputs, { context, wants, path})

                    if(fields && fields instanceof Object) {
                        return await resolveWants(fields, wants, schema.fields, path)
                    }
                    return null
                }
                
                if(schema.type === 'array') {
                    let promises = []
                    let arrField = await resolver(inputs, {context, wants, path})
                    
                    if(!Array.isArray(arrField)) return null

                    for(let i in arrField) {
                        promises.push(resolveWant(arrField[i], want, schema.array, `${path}.${i}`))
                    }

                    return await Promise.all(promises)
                }

                if(schema.type === 'scalar') {
                    let ScalarClass = new scalarResolvers[schema.scalar]
                    let result = await resolver(inputs, {context, wants, path})
                    if(result !== undefined) return await ScalarClass.outgoing(result)
                    return
                }
            }

            return nullWrapper(await value(), schema, path)
        }

        async function resolveWants (fields, wants, schemas, parent) {
            let resultFields = {}
            let promises = []
            
            for(let name in wants) {
                let path = `${parent}.${name}`

                promises.push(resolveWant(fields[name], wants[name], schemas[name], path).then(val => resultFields[name] = val))
            }

            await Promise.all(promises)

            return resultFields
        }
    }

    function getFieldType (value, path) {
        if (scalarTypes.includes(value)) {
            return {
                type: 'scalar',
                scalar: value,
                value: value
            }
        }

        if (Object.keys(types).includes(value)) {
            return {
                type: 'type',
                fields: types[value].fields
            }
        }

        throw new GraphError(value + ' is not a valid type', path)
    }

    function getInputType (value, path) {
        if (scalarTypes.includes(value)) {
            return {
                type: 'scalar',
                scalar: value,
                value: value
            }
        }

        if (Object.keys(types).includes(value)) {
            return {
                type: 'type',
                inputs: types[value].fields
            }
        }

        throw new GraphError(value + ' is not a valid type', path)
    }

    function compareItems (queryTree) {
        for (let i in queryTree) {
            let name = queryTree[i].name
            let messageSchema = mergedMessageTypes[name]
            let query = queryTree[i]
            if (!messageSchema) throw new GraphError(`No recognised message type: ${name}`, name)
            CheckForUnrecognisedInputs(query.inputs, messageSchema.inputs, name)
            CheckForMissingInputs(query.inputs, messageSchema.inputs, name)
            
            if (
                messageSchema.fields && Object.keys(messageSchema.fields).length > 0
                || messageSchema.array && messageSchema.array.fields && Object.keys(messageSchema.array.fields).length > 0) {
                let fields = messageSchema.fields || messageSchema.array.fields
                if (!query.wants) throw new GraphError(`No wants provided for ${path}`, path)
                CheckForUnrecognisedWants(query.wants, fields, name)
            }
        }
    }

    function expandInputs (field, path) {
        for(let name in field.inputs) {
            let input = field.inputs[name]

            //assign expanded type to field
            if (input.type === 'type') Object.assign(input, getInputType(input.value, path))

            //expand array
            if (input.type === 'array') {
                input.array = getInputType(input.value, path)
                input.array.directives = []
            }

            expandInputs(input, `${path}.${name}`)
        }
    }

    function expandField (field, path) {
        //assign expanded type to field
        if (field.type === 'type') Object.assign(field, getFieldType(field.value, path))

        //expand paginators into full output type
        if (field.type === 'paginator') {
            field.fields = {
                items: {
                    type: 'array',
                    array: {
                        ...getFieldType(field.paginator, path),
                        nullable: field.arrayItemNullable,
                        directives: []
                    },
                    nullable: field.nullable,
                    directives: field.directives
                },
                ...paginators[field.value].fields
            }
            field.type = 'type'
        }

        //expand array
        if (field.type === 'array') {
            if(!field.array) field.array = {}
            Object.assign(field.array, getFieldType(field.value, path))
            field.array.directives = []
            field.array.nullable = field.arrayItemNullable
        }

        expandInputs(field, path)
    }
}

function checkForMissing (keys, type, obj) {
    keys.map(i => {
        if (!obj[i]) throw new GraphError(`Could not find resolver for ${type}: ${i}`, `${type}.${i}`)
    })
}

function CheckForUnrecognisedInputs (inputs, schemaInputs, parentPath) {
    for (let name in inputs) {
        let path = `${parentPath}.${name}`
        let input = inputs[name]
        let schema = schemaInputs[name]

        if (!schema) throw new GraphError(`Unrecognised input: ${path}`, path)
        if (schema.type === 'type') {
            if (!(input instanceof Object)) throw new GraphError(`Input ${path} is not type ${schema.value}`, path)
            CheckForUnrecognisedInputs(input, schema.inputs, path)
        }
        if (schema.type === 'array') {
            console.log(input[Symbol.iterator])
            if (typeof input[Symbol.iterator] !== 'function') throw new GraphError(`Input ${path} is not type [${schema.value}] (array)`, path)
            for (let i in input) {
                let arrayPath = `${path}.${i}`
                
                if (schema.array.type === 'type') {
                    CheckForUnrecognisedInputs(input[i], schema.array.fields, arrayPath)
                } else {
                    CheckForUnrecognisedInputs(input[i], { [i]: schema.array }, arrayPath)
                }
            }
        }
    }
}

function CheckForMissingInputs (inputs, schema, parentPath) {
    for (let name in schema) {
        let path = `${parentPath}.${name}`
        let input = inputs[name]

        input = nullWrapper(input, schema[name], path)
        if(schema[name].nullable !== true) {
            // check for missing inputs in type (object)
            if (schema.type === 'type') CheckForMissingInputs(input, schema.fields, path)

            if (schema.type === 'array') {
                for (let i in input) {
                    let arrayPath = `${path}.${i}`
                    //check for missing types in array items
                    if (schema.array.type === 'type') {
                        CheckForMissingInputs(input[i], schema.array.fields, arrayPath)
                    } else {
                        CheckForMissingInputs(input[i], { [i]: schema.array }, arrayPath)
                    }
                }
            }
        }
    }
}

function CheckForUnrecognisedWants (wants, schema, parentPath) {
    for (let name in wants) {
        let want = wants[name]
        let fieldSchema = schema[name]
        let path = `${parentPath}.${name}`
        if (!fieldSchema) throw new GraphError(`No such field ${path}`, path)
        
        CheckForUnrecognisedInputs(want.inputs, fieldSchema.inputs, path)
        if (
            fieldSchema.fields && Object.keys(fieldSchema.fields).length > 0
            || fieldSchema.array && fieldSchema.array.fields && Object.keys(fieldSchema.array.fields).length > 0) {
            let fields = fieldSchema.fields || fieldSchema.array.fields
            if (!want.wants) throw new GraphError(`No wants provided for ${path}`, path)
            CheckForUnrecognisedWants(want.wants, fields)
        }
    }
}

function nullWrapper (value, schema, path) {
    if ([null, undefined].includes(value)) {
        if(schema.nullable !== true) throw new GraphError(`${path} is non-nullable, got nullable type`, path)
        return null
    }
    return value
}
