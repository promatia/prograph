class Model {
    constructor(document) {
        this.doc = document

        return new Proxy(this, {
            set: (object, key, value, proxy) => {
                object.doc[key] = value
                return true
            },
            get: (object, key) => {

            }
        })
    }
}

class User extends Model {
    static types = `
    type User {
        firstName: String
    }
    `

    set password(value) {
        console.log(value)
    }

    static async User({ _id }, { wants }) {

    }
}

let user = new User({
    firstName: "Dominus"
})

console.log(User.types)

user.a = 3

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
    async UpdateUser({ }) {

    },
    async User({ }) {

    },
    async Me({ }) {

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
        async incoming(value) {
            return new ObjectID(value)
        }

        async outgoing(value) {
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


async function main() {
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


function projectField(wants, parent = '') {
    let projectFields = {}

    for (let name in wants) {
        let want = wants[name]
        name = parent + '.' + name
        if (want.constructor === Object) {
            Object.assign(projectFields, projectField(want, name))
        } else {
            projectFields[name] = 1
        }
    }
}

projectField
