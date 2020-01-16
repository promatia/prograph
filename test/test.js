
describe('checksForMissingDirectives', function () {
    console.log('test')
})


`
- checksForMissingDirectives
- checksForMissingMessageResolvers
- checksForMissingScalars
- checksForMissingSchema
- ReturnsOnlyWants
- ValidatesInputs
- ValidatesTypeInputs
- ValidatesArrayInputsScalar
- ValidatesArrayInputsType
- ReturnsArrayWants
- ReturnsScalarWants
- CostAnalyserThrows
- CostAnalyserMultiplies
- PrimitiveArgumentsWork
- ThrowsForUnrecognisedWants
- ThrowsForUnrecognisedArguments
- TypeChecks
- HandlesErrors
- EmptyDirectiveClassesWork
- EmptyScalarClassesWork
- RecursiveTypeWorks
- RecursiveTypeArray
- PassesWithNoContext
- PassesWithNoDefaultCost
- HandlesDefaultCost
- SpreadOperatorsWorkType
- SpreadOperatorsWorkArgument
- PaginatorWorks
- ArrayWorks
- StringWorks
- BooleanWorks
- ObjectIDWorks
- DirectivesCalledInOrder
- DirectivesCalledInParallel
- MessagesCalledInParallel
- Returns null for undefined always
- Iterates non-array iterable
- Resolves instanceof Object for types
- message can return array type
    - primitive subtype
    - scalar subtype
    - type subtype
- message returns scalar
- message returns primitive
- message returns type
- support aliases
- supports async resolvers
- supports sync resolvers
- supports default field value resolver
`
