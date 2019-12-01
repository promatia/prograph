class Model {
    constructor (document = {}) {
        this.doc = document

        return new Proxy(this, {
            set (obj, key, value) {
                if (key === 'doc') {
                    obj.doc = value
                    return true
                }
                
                if (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), key)) {
                    obj[key] = value
                    return true
                }

                obj.doc[key] = value

                return true
            },
            get (obj, key) {
                if (obj[key]) return obj[key]

                return obj.doc[key]
            }
        })
    }

    async save () {
        let _id = this.doc._id

        if (_id) {
            await this.collection.updateOne({_id}, {$set: {...this.doc}}, { upsert: true })
        } else {
            let insert = await this.collection.insertOne(this.doc)
            this.document._id = insert.insertedId
        }
    }
}

function bcrypt (value) {
    return 'hash' + value
}

function db () {
    return {}
}
class User extends Model {
    static collection = db('users')
    static types = `
    type User {
        firstName: String
    }
    `

    async friends ({ after }, { wants }) {
        this.collection
            .find({_id: { $in: this.doc.friends }})
            .project(Only(wants))
            .sort(-1)
            .limit(5)
            .toArray()
    }

    set password (value) {
        this.doc.password = bcrypt(value)
    }

    static async User ({ _id }, { wants }) {

    }
}

// let user = new User({
//     firstName: 'Dominus'
// })

// user.password = 'aXXSAS' //hashes password
// console.log(user.password)


//****************** */

const { Builder, Scalar, Directive } = require('..')
const Graph = require('./gqlreq')
const { ObjectID } = require('mongodb')

const schema = `
scalar ObjectID

directive isAuthenticated INPUT FIELD OBJECT
directive hasScope(scope: String!) INPUT FIELD OBJECT
directive lowercase INPUT
directive email INPUT

type PaginationInput {
    limit: Number @max(amount: 50)
    after: ObjectID
    before: ObjectID
}

paginator CursorPaginator {
    startCursor: ObjectID
    endCursor: ObjectID
    nextPage: Boolean
    previousPage: Boolean
}

type Session {
    _id: ObjectID
    lastUsed: String
    OS: String
    Agent: String
}

type FriendsInput {
    test: Number
}

message UpdateUser (
    _id: ObjectID
    firstName: String @cost(cost: 20)
    lastName: String
    email: String! @lowercase @email
    friends: FriendsInput
): User @cost(cost: 5, multipliers: ["friends"]) @hasScope(scope: "updateProfile")

message User (_id: ObjectID): User @hasScope(scope: "viewProfile") 

message Me: User @isAuthenticated

type User {
    _id: ObjectID
    firstName: String
    lastName: String
    email: String
    roles: [String]
    fullName: String @deprecated(reason: "Use firstName and lastName")
    friends(test: ObjectID, ...PaginationInput): CursorPaginator[User]
    citizenshipData: CitizenshipData @cost(multiplyParent: true)
    sessions(...PaginationInput): CursorPaginator[Session]
}

type CitizenshipData {
    accepted: Number
}

`

const messageResolvers = {
    async UpdateUser ({_id, firstName, email, friends}) {
        return {
            _id,
            firstName,
            email,
            friends (inputs) {
                console.log(inputs)
            }
        }
    },
    async User ({ }) {

    },
    async Me ({ }) {

    }
}

const directiveResolvers = {
    hasScope: Directive,
    isAuthenticated: Directive,
    lowercase: Directive,
    email: Directive
}


const scalarResolvers = {
    ObjectID: class extends Scalar {
        async incoming (value) {
            return new ObjectID(value)
        }

        async outgoing (value) {
            return String(value)
        }
    }
}

let graph = Graph(new Builder({
    schema,
    messageResolvers,
    directiveResolvers,
    scalarResolvers
}))


async function main () {
    let msg = {
        _id: '5d84b5b1e8840b64a03c944a',
        firstName: 'Bill',
        email: 'Test',
        friends: {
            test: 1
        }
    }

    await graph`
        message UpdateUser (${msg}) {
            _id
            firstName
            roles
            friends(limit: 5) {
                items {
                    firstName
                }
            }
        }
    `
}

main().catch((err) => {
    console.error(err)
})


//project fields
function Only (wants, parent = '') {
    let projectFields = {}

    for (let name in wants) {
        let want = wants[name]
        name = parent + '.' + name
        if (want.constructor === Object) {
            Object.assign(projectFields, Only(want, name))
        } else {
            projectFields[name] = 1
        }
    }
}
