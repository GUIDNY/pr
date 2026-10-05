/** The inputType values CategoryAttribute accepts — see prisma/schema.prisma. */
export const INPUT_TYPES = ["text", "number", "select", "boolean"] as const;

/** Products per server-action call. Each product is a delete and an insert
    inside one transaction; a hundred of them is a few seconds, well inside
    a serverless function's budget, and a failure loses at most one batch. */
export const SPEC_IMPORT_BATCH = 100;
