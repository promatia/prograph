import tokenizer from './tokenizer.js'

export default (queryString) => {
    let { peek, next, eof, croak } = tokenizer(queryString)

    let messages = []

    function delimited (start, stop, parser) {
        if (!isPunc(start)) return
        next()
        while (!isPunc(stop)) {
            if (isNextItem()) {
                next()
                continue
            }
            parser()
        }
        return next()
    }

    function parseWant (parentpath) {
        let fieldnameOrAlias = next().value
        let alias = fieldnameOrAlias
        let fieldname = fieldnameOrAlias
        let path = parentpath + '.' + alias

        if(isPunc(':')) {
            next()
            fieldname = next().value
            if(peek().type === 'var') croak(`No field name provided for alias: ${path}`)
        }

        let inputs = parseInputFields(path)
        let wants = parseWants(path)
        
        return {
            fieldname,
            alias,
            inputs,
            wants
        }
    }

    function parseWants (path) {
        let fields = []

        delimited('{', '}', ()=>{
            fields.push(parseWant(path))
        })

        if (fields.length === 0) return

        return fields
    }

    function isObject () {
        return peek().type === 'punc' && peek().value === '{'
    }

    function isPunc (type) {
        return peek().type === 'punc' && peek().value === type
    }

    function isPrimitive () {
        let type = peek().type
        return type === 'num' || type === 'str' || type === 'boolean' || type === 'null'
    }

    //Possible types
    //  Number, String, Boolean - Primitive
    //  Type - Type
    //  [Type] - Array of Type
    //  Paginator[Type] - Paginated Data
    //  nullable
    function parseValue (field) {
        if (isPunc('[')) {
            let arr = []
            let i = 0
            delimited('[', ']', () => {
                arr.push(parseValue(`${field}.${i++}`))
            })
            
            return arr
        }
        if (isPrimitive()) {
            return next().value
        }
        if (isObject()) {
            return parseInputs(field)
        }
        croak(`${peek().type} ${peek().value} is not a valid field value`)
    }

    function isOperator (type) {
        return peek().type === 'operator' && peek().value === type
    }

    function isNextItem () {
        return isPunc('newline') || isPunc(',')
    }

    function parseInputs (path) {
        let inputs = {}

        delimited('{', '}', ()=>{
            let field = next().value

            if (!isPunc(':')) croak(`No separator for ${`${path}.${field}`} provided`)
            next()

            inputs[field] = parseValue(`${path}.${field}`)
        })

        return inputs
    }

    function parseInputFields (path) {
        let inputs = {}

        delimited('(', ')', ()=>{
            let field = next().value

            if (!isPunc(':')) croak(`No separator for ${`${path}.${field}`} provided`)
            next()

            inputs[field] = parseValue(`${path}.${field}`)
        })

        return inputs
    }
    
    function traverse () {
        if (isNextItem()) {
            return next()
        }

        if (isOperator('message')) {
            next()
            messages.push(parseWant(''))
        }
    }

    while (!eof()) {
        traverse()
    }

    return messages
}
