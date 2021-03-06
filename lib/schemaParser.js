import tokenizer from './tokenizer.js'

export default function schemaParser (typedefs) {
    let { peek, next, eof, croak } = tokenizer(typedefs)

    let scalarTypes = []
    let directives = {}
    let paginators = {}
    let subscriptions = {}
    let types = {}
    let messages = {}

    function delimited (start, stop, isNextItem, parser) {
        if (!isPunc(start)) return
        next()
        while (!isPunc(stop)) {
            if (isNextItem()) {
                next()
                if (isNextItem()) croak('multiple seperators provided')
                continue
            }
            parser()
        }
        if (isPunc(stop)) return next()
        croak(`expected: "${punc}", got: "${peek().value}"`)
    }

    function getFields (parent) {
        let fields = {}

        delimited('{', '}', isNextItem, () => {
            let fieldName = next().value
            let path = `${parent}.${fieldName}`
            let inputs = getInputs(path)
            if (!isPunc(':')) croak(`No separator for ${path} provided`)
            next()
            let type = parseFieldValue(path)
            let nullable = getNullable(path)
            let directives = getDirectives(path)


            fields[fieldName] = {
                inputs,
                ...type,
                directives,
                nullable
            }

        })

        return fields
    }

    function getInputs (parent) {
        let fields = {}

        delimited('(', ')', isNextItem, () => {
            let fieldName = next().value
            let path = `${parent}.${fieldName}`
            if (!isPunc(':')) croak(`No separator for ${path} provided`)
            next()
            let type = parseFieldValue(path)
            let nullable = getNullable(path)
            let directives = getDirectives(path)

            fields[fieldName] = {
                ...type,
                directives,
                nullable
            }
        })

        return fields
    }

    function isVar () {
        return peek().type === 'var'
    }

    function getArgs (path) {
        let args = {}

        delimited('(', ')', isNextItem, () => {
            let { name, token } = getArg(path)
            args[name] = token
        })

        return args
    }

    function getArg (path) {
        if (!isVar()) {
            croak(`Argument name in ${path} is not valid, got: "${peek().value}"`)
        }
        
        let name = next().value
        if (!isPunc(':')) croak(`No separator provided for ${path}`)
        next()

        if (isPunc('[')) {
            let values = []
            delimited('[', ']', isNextItem, ()=>{
                values.push(next().value)
            })
            
            return {
                name,
                token: {
                    type: 'array',
                    value: values
                }
            }
        }
    
        let token = next()
        let nullable = getNullable()
        
        return {
            name,
            token,
            nullable
        }
    }

    function getNullable () {
        if (isPunc('!')) {
            next()
            return false
        }
        return true
    }

    function isPunc (type) {
        return peek().type === 'punc' && peek().value === type
    }

    function isDirective () {
        return peek().type === 'directive'
    }

    function getDirectives (parent) {
        let directives = []
        while (isDirective()) {
            let name = next().value
            let path = `${parent}.${name}`

            directives.push({
                name,
                args: getArgs(path)
            })
        }

        return directives
    }

    function isPrimitive () {
        let type = peek().type
        return type === 'num' || type === 'str' || type == 'boolean'
    }

    //Possible types
    //  Number, String, Boolean - Primitive
    //  Type - Type
    //  [Type] - Array of Type
    //  Paginator[Type] - Paginated Data
    //  nullable
    function parseFieldValue (parent) {
        if (isPrimitive()) { //parse primitive
            let value = next().value
            return {
                type: 'primitive',
                value
            }
        }
        if (isPunc('[')) { //parse array type
            next()
            if (isVar()) {
                let value = next().value
                let arrayItemNullable = getNullable()
                if (!isPunc(']')) croak(`No closing "]" provided for ${parent}.${value}`)
                next()
                return {
                    type: 'array',
                    value,
                    arrayItemNullable
                }
            }
            croak(`No valid type provided for ${parent}: Type: "${peek().type}", Value: "${peek().value}"`)
        }
        if (isVar()) {
            let value = next().value
            if (isPunc('[')) { // paginator value
                next()
                if (isVar()) {
                    let paginator = next().value
                    let arrayItemNullable = getNullable()
                    if (!isPunc(']')) croak(`Paginator must only have one type, expected ], got: ${peek().value}`)
                    next()
                    return {
                        type: 'paginator',
                        paginator,
                        value,
                        arrayItemNullable
                    }
                }
                croak(`${peek().value} is not a valid paginator type`)
            }
            return {
                type: 'type',
                value
            }
        }
        croak(`${peek().type} ${peek().value} is not a valid field value`)
    }

    function isOperator (type) {
        return peek().type === 'operator' && peek().value === type
    }

    function getVisitors () {
        let visitors = []
        if (isVar()) {
            while (isVar()) {
                visitors.push(next().value)
            }
            return visitors
        }
        croak('Directives must provide at least one directive visitor (INPUT, FIELD, OBJECT)')
    }

    function isNextItem () {
        return isPunc('newline') || isPunc(',')
    }

    function parseDirective () {
        if (!isVar()) croak('Directive name not provided')
        directives[next().value] = {
            args: getArgs(),
            visitors: getVisitors()
        }
    }

    function parsePaginator () {
        let name = next().value
        paginators[name] = {
            fields: getFields(name),
            directives: getDirectives(name)
        }
    }

    function parseMessage () {
        let fieldName = next().value
        let inputs = getInputs(fieldName)
        if (!isPunc(':')) croak(`No separator ':' for message ${fieldName} provided`)
        next()
        let type = parseFieldValue(fieldName)
        let directives = getDirectives(fieldName)
        let nullable = getNullable(fieldName)

        messages[fieldName] = {
            inputs,
            ...type,
            directives,
            nullable
        }
    }

    function parseType () {
        let fieldName = next().value
        types[fieldName] = {
            fields: getFields(fieldName),
            directives: getDirectives(fieldName)
        }
    }

    function traverse () {
        if (isNextItem()) {
            return next()
        }

        if (isOperator('type')) {
            next()
            return parseType()
        }
        if (isOperator('message')) {
            next()
            return parseMessage()
        }
        if (isOperator('scalar')) {
            next()

            if (isVar()) {
                return scalarTypes.push(next().value)
            }
            croak('No scalar type provided')
        }
        if (isOperator('directive')) {
            next()
            if (isVar()) {
                return parseDirective()
            }
            croak('No directive name provided')
        }
        if (isOperator('paginator')) {
            next()
            if (isVar()) {
                return parsePaginator()
            }
            croak('No paginator name provided')
        }
        //todo: subscription
        croak(`No valid operator match, found: "${peek().value}"`)
    }

    while (!eof()) {
        traverse()
    }

    return {
        messages,
        scalarTypes,
        directives,
        types,
        paginators,
        subscriptions
    }
}
