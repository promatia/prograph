function checkNested (obj, current, ...levels) {
    if (obj === undefined) return false
    if (obj.constructor !== Object && levels.length === 0) return false
    if (levels.length == 0 && obj.hasOwnProperty(current)) return true
    return checkNested(obj[current], ...levels)
}

export default function doCostAnalysis (queryTree, schemas, max, defaultCost) {
    let cost = 0
    
    function getSchemaCost (schema, input, parentCost = 1) {
        let directives = schema.directives
        let totalCost = 0
    
        for (let i in directives) {
            let directive = directives[i]
            if (directive.name === 'cost') {
                let args = directive.args
                let cost = args.cost ? args.cost.value : 1
                let multiplyParent = args.multiplyParent || false
                let multiplierAmount = 1
                if (args.multipliers) {
                    args.multipliers.value.map(multiplier => {
                        let splitMultiplier = multiplier.split('.')
                        if (checkNested(input, ...splitMultiplier)) {
                            let value = splitMultiplier[splitMultiplier.length - 1]
                            if (!isNaN(value)) { 
                                multiplierAmount += value
                            } else {
                                multiplierAmount++
                            }
                        }
                    })
                }
                totalCost += (multiplierAmount * cost) * (multiplyParent ? parentCost : 1)
            }
        }
    
        if (totalCost === 0) totalCost += defaultCost
        
        increaseCost(totalCost)

        return totalCost
    }
    
    
    function getInputCosts (messageSchema, inputs, parentCost) {
        for (let name in inputs) {
            let schema = messageSchema[name]
            getSchemaCost(schema, inputs[name], parentCost)
            if (schema.type === 'type') {
                getInputCosts(schema.fields, inputs[name], parentCost)
            }
        }
    }
    
    function getWantsCosts (messageSchema, wants, parentCost) {
        for (let name in wants) {
            let schema = messageSchema[name]
            getSchemaCost(schema, wants[name], parentCost)
            if (schema.type === 'type') {
                getInputCosts(schema.fields, wants[name].args, parentCost)
                getWantsCosts(schema.fields, wants[name].wants, parentCost)
            }
        }
    }

    function increaseCost (amount) {
        if (cost + amount > max) throw new Error(`Query failed, cost exceeded max limit: ${max}`)
        cost += amount
    }

    for (let i in queryTree) {
        let queryItem = queryTree[i]
        let name = queryItem.name
        let messageSchema = schemas[name]
        let parentCost = getSchemaCost(messageSchema, queryItem)
        getInputCosts(messageSchema.inputs, queryItem.inputs, parentCost)
        if (messageSchema.fields) getWantsCosts(messageSchema.fields, queryItem.wants, parentCost)
    }

    return cost
}
