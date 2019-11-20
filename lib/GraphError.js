module.exports = class GraphError extends Error {
    constructor (message, location){
        super(message)
        this.location = location
        this.name = 'GraphError'
    }
}
