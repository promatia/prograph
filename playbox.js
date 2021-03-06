
//****************** */

import { Builder, Scalar, Directive } from './index.js'
import Graph from './graph.js'
import mongodb from 'mongodb'


const { ObjectID } = mongodb

const schema = `
scalar ObjectID

directive isAuthenticated INPUT FIELD OBJECT
directive hasScope(scope: String!) INPUT FIELD OBJECT
directive lowercase INPUT
directive email INPUT
directive max INPUT

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


type User {
    _id: ObjectID
    firstName: String
    lastName: String
    email: String
    roles: [String]
    fullName: String @deprecated(reason: "Use firstName and lastName")
    friends (test: ObjectID, PaginationInput: PaginationInput): CursorPaginator[User]
    citizenshipData: CitizenshipData @cost(multiplyParent: true)
    sessions (PaginationInput: PaginationInput): CursorPaginator[Session]
}

type CitizenshipData {
    accepted: Number
}

type FriendsInput {
    test: Number
}

message UpdateUser (
    _id: ObjectID
    firstName: String @cost(cost: 20)
    lastName: String!
    email: String! @lowercase @email
    friends: [FriendsInput]
): User @cost(cost: 5, multipliers: ["friends"]) @hasScope(scope: "updateProfile")

message User (_id: ObjectID): User @hasScope(scope: "viewProfile") 

message Me: User @isAuthenticated



`

const messageResolvers = {
    async UpdateUser ({_id, firstName, email}) {
        return {
            _id,
            firstName,
            email,
            friends () {
                return { items: ['sdas', {lalaa: 'sda', 'firstName': 'Billy'}, {}]}
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
    lowercase: class Lowercase extends Directive {
        async inputVisitor ({value}) {
            return value.toLowerCase()
        }
    },
    email: Directive,
    max: class Max extends Directive {
        async inputVisitor ({value, args}) {
            if(value > args.amount.value) throw new Error(`Input: ${value} exceeds max: ${args.amount.value}`)
            return value
        }
    }
}


const scalarResolvers = {
    ObjectID: class extends Scalar {
        async incoming ({value}) {
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
        lastName: 'test',
        email: 'Test',
        friends: [{
            test: 1
        }]
    }

    let result = await graph`
        message UpdateUser (${msg}) {
            _id
            firstName
            roles
            friends(PaginationInput: {limit: 5}) {
                items {
                    firstName
                }
            }
        }

        message aliasTest: UpdateUser(${msg}){
            test: _id
        }
    `

    console.log(result)
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
