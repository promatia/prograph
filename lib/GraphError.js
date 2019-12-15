export default class GraphError extends Error {
    constructor (err, location) {
        super(err)
        this.location = location
        this.name = 'GraphError'
    }
}
