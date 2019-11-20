class Directive {
    async inputVisitor({
        next,
        value,
        fieldName,
        directiveArgs,
        context
    }){
        return await next(value)
    }

    async fieldVisitor({
        value,
        wants,
        fieldName,
        directiveArgs,
        inputArgs,
        context
    }){
        return await value()
    }

    // async objectVisitor(){
        
    // }

    // async argumentVisitor(){

    // }

    // async introspector(){

    // }
}

module.exports = Directive