const Scalar = require('./scalar')

module.exports = {
    String: class String extends Scalar {
        async incoming (value){
            if (typeof value === 'string'){
                return value
            }
    
            throw new Error(`Cannot turn value into string: ${value}`)
        }
        async outgoing (value){
            if (typeof value === 'string'){
                return value
            }
            
            return value.toString()
        }
    },
    Boolean: class Boolean extends Scalar {
        async incoming (value){
            if (typeof value === 'boolean'){
                return value
            }
            throw new Error(`Value is not boolean: ${value}`)
        }
        async outgoing (value){
            if (typeof value === 'boolean'){
                return value
            }
            throw new Error(`Value is not boolean: ${value}`)
        }
    },
    Number: class Number extends Scalar {
        async incoming (value){
            if (typeof value === 'number'){
                return value
            }
            throw new Error(`Value is not a number: ${value}`)
        }
        async outgoing (value){
            if (typeof value === 'number'){
                return value
            }
            throw new Error(`Value is not a number: ${value}`)
        }
    }
}
