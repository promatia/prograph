import Scalar from './scalar.js'

export class String extends Scalar {
    async incoming (value) {
        if (typeof value === 'string') {
            return value
        }
    
        return null
    }
    async outgoing (value) {
        if (typeof value === 'string') {
            return value
        }
        if(value && value.toString) return value.toString()

        return null
    }
}

export class Boolean extends Scalar {
    async incoming (value) {
        if (typeof value === 'boolean') {
            return value
        }
        return null
    }
    async outgoing (value) {
        if (typeof value === 'boolean') {
            return value
        }
        return null
    }
}

export class Number extends Scalar {
    async incoming (value) {
        if (typeof value === 'number') {
            return value
        }
        return null
    }
    async outgoing (value) {
        if (typeof value === 'number') {
            return value
        }
        return null
    }
}
