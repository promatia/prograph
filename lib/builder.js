const queryParser = require('./queryParser')
const schemaParser = require('./schemaParser')
const GraphError = require('./GraphError')
const costAnalyser = require('./costAnalyser')
const defaultScalars = require('./defaultScalars')
const Directive = require('./directive')

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

function Builder ({
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

    let mergedMessageTypes = { ...paginators, ...subscriptions, ...messages }

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
        let queryTree = queryParser(queryString)

        compareItems(queryTree)
        costAnalyser(queryTree, mergedMessageTypes, max, defaultCost)

        for (let i in queryTree) {
            let message = queryTree[i]
            let name = message.name
            let schema = mergedMessageTypes[name]

            await TypeCheckInputs(message.inputs, schema.inputs, name, context)
            console.log(message)

            let messageResolver = messageResolvers[message.name]
            

            messageResolvers(message.inputs, message.wants, schema, name)
            //wantFieldResolvers
            //resolve promises
            //filterwants
            //typecheck results
            //bubble results
        }

        //parse each message asynchronously in order
    }

    function getType (value, path) {
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

    function compareItems (queryTree) {
        for (let i in queryTree) {
            let name = queryTree[i].name
            let messageSchema = mergedMessageTypes[name]
            if (!messageSchema) throw new GraphError(`No recognised message type: ${name}`, name)

            CheckForUnrecognisedInputs(queryTree[i].inputs, messageSchema.inputs, name)
            CheckForMissingInputs(queryTree[i].inputs, messageSchema.inputs, name)
            CheckForUnrecognisedWants(queryTree[i].wants, messageSchema.fields, name)
        }
    }

    async function inputDirectiveResolver (value, schema, fieldName, context) {
        let directives = schema.directives
        let i = 0
        async function next (value) {
            if (directives[i]) {
                let directive = directives[i++]
                let directiveClass = new directiveResolvers[directive.name]()

                return await directiveClass.inputVisitor({
                    value,
                    next,
                    fieldName,
                    context,
                    directiveArgs: directive.args
                })
            }
            
            return value
        }

        return await next(value)
    }

    async function TypeCheckInputs (inputs, inputsSchema, parentPath, context) {
        let promises = []

        for (let name in inputs) {
            let path = `${parentPath}.${name}`
            let input = inputs[name]
            let inputSchema = inputsSchema[name]
            if (inputSchema.type === 'scalar') {
                let scalarType = new scalarResolvers[inputSchema.scalar]()
                let promise = scalarType
                    .incoming(input)
                    .then(
                        async (val) =>
                            await inputDirectiveResolver(val, inputSchema, name, context)
                    )
                    .then((val) => (inputs[name] = val))
                    .catch((error) => {
                        throw new GraphError(error, path)
                    })
                promises.push(promise)
            }
            if (inputSchema.type === 'type') {
                promises.push(TypeCheckInputs(input.fields, inputSchema.fields, path))
            }
        }

        await Promise.all(promises)
    }

    function expandField (field, path) {
        //replace spread operators in field args
        for (let argName in field.args) {
            let arg = field.args[argName]
            if (arg === 'spread') {
                delete field.args[argName]
                Object.assign(field.args, types[argName].fields)
            }
        }

        //expand paginators into full output type
        if (field.type === 'paginator') {
            field.fields = {
                items: {
                    type: 'array',
                    array: {
                        ...getType(field.paginator, path),
                        nullable: field.nullableArrayItem
                    },
                    nullable: field.nullable
                },
                ...paginators[field.value].fields
            }
        }

        //assign expanded type to field
        if (field.type === 'type') Object.assign(field, getType(field.value, path))

        //expand array
        if (field.type === 'array') field.array = getType(field.value, path)
    }
}

module.exports = Builder

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
        if (!schema) throw new GraphError(`Unrecognised item ${path}`, path)
        if (schema.type === 'type') {
            if (input.constructor !== Object) throw new GraphError(`Input ${path} is not type ${schema.value}`, path)
            CheckForUnrecognisedInputs(input, schema.fields, path)
        }
        if (schema.type === 'array') {
            if (input.constructor !== Array) throw new GraphError(`Input ${path} is not type [${schema.value}]`, path)
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
        if (schema[name].nullable !== true) {
            let path = `${parentPath}.${name}`
            let input = inputs[name]
            if (!input) throw new GraphError(`Missing field in ${path}`, path)

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
        if (fieldSchema.fields || (fieldSchema.array && fieldSchema.array.fields)) {
            let fields = fieldSchema.fields || fieldSchema.array.fields
            if (!want.wants) throw new GraphError(`No wants provided for ${path}`, path)
            CheckForUnrecognisedWants(want.wants, fields)
        }
    }
}

module.exports = Builder
