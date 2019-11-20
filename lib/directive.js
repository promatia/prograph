class Directive {

    /**
     * 
     * @param {InputVisitorArguments} Arguments 
     * //fieldName,
     * //directiveArgs
     * //contex
     */
    async inputVisitor ({next, value}){
        return await next(value)
    }

    /**
     * 
     * @param {FieldVisitorArguments} param0 
     * wants,
        fieldName,
        directiveArgs,
        inputArgs,
        context
     */
    async fieldVisitor ({value}){
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
