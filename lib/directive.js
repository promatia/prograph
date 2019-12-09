class Directive {

    /**
     * 
     * @param {InputVisitorArguments} Arguments 
     * //fieldName,
     * //directiveArgs
     * //context
     */
    async inputVisitor ({value}) {
        return value
    }

    /**
     * 
     * @param {FieldVisitorArguments} param0 
        wants,
        fieldName,
        directiveArgs,
        inputArgs,
        context
     */
    async fieldVisitor ({value}) {
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
