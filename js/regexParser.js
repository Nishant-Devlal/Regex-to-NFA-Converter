const REGEX_OPERATORS = {
    UNION: "+",
    CONCAT: ".",
    STAR: "*"
};

const OPEN_PAREN = "(";
const CLOSE_PAREN = ")";

function isOperator(token) {
    return (token === REGEX_OPERATORS.UNION || token === REGEX_OPERATORS.CONCAT || token === REGEX_OPERATORS.STAR);
}

function isSymbol(token) {
    return (typeof token === "string" &&  token.length === 1 && !isOperator(token) && token !== OPEN_PAREN && token !== CLOSE_PAREN);
}

function canStartExpression(token) {
    return (isSymbol(token) || token === OPEN_PAREN);
}

function canEndExpression(token) {
    return (isSymbol(token) || token === CLOSE_PAREN || token === REGEX_OPERATORS.STAR);
}

/*VALIDATE REGULAR EXPRESSION*/
function validateRegex(regex) {
    if (typeof regex !== "string") {
        throw new Error("Regular expression must be a string.");
    }
    regex = regex.trim();
    if (regex.length === 0) {
        throw new Error("Regular expression cannot be empty.");
    }
    const tokens = [...regex];
    let parenthesisBalance = 0;
    for (let i = 0; i < tokens.length; i++) {
        const current = tokens[i];
        const previous = i > 0 ? tokens[i - 1] : null;
        const next = i < tokens.length - 1 ? tokens[i + 1] : null;
        if (current === OPEN_PAREN) {
            parenthesisBalance++;
            if (next === CLOSE_PAREN) {
                throw new Error(`Empty parentheses at position ${i + 1}.`);
            }
            if (previous !== null && (isSymbol(previous) || previous === CLOSE_PAREN || previous === REGEX_OPERATORS.STAR)) {}
            continue;
        }

        if (current === CLOSE_PAREN) {
            parenthesisBalance--;
            if (parenthesisBalance < 0) {
                throw new Error(`Unexpected closing parenthesis at position ${i + 1}.`);
            }
            if (previous === null || previous === OPEN_PAREN || previous === REGEX_OPERATORS.UNION) {
                throw new Error(`Invalid expression before ')' at position ${i + 1}.`);
            }
            continue;
        }

        /* Union '+' */
        if (current === REGEX_OPERATORS.UNION) {
            if (previous === null) {
                throw new Error("Union operator '+' cannot appear at the beginning.");
            }
            if (previous === REGEX_OPERATORS.UNION || previous === REGEX_OPERATORS.CONCAT || previous === OPEN_PAREN) {
                throw new Error(`Invalid use of '+' at position ${i + 1}.`);
            }
            if (next === null) {
                throw new Error("Union operator '+' cannot appear at the end.");
            }
            if (next === REGEX_OPERATORS.UNION || next === REGEX_OPERATORS.STAR || next === CLOSE_PAREN || next === REGEX_OPERATORS.CONCAT) {
                throw new Error(`Invalid expression after '+' at position ${i + 1}.`);
            }
            continue;
        }

        if (current === REGEX_OPERATORS.CONCAT) {
            if (previous === null || next === null) {
                throw new Error("Concatenation operator '.' must have expressions on both sides.");
            }
            if (!canEndExpression(previous) || !canStartExpression(next)) {
                throw new Error(`Invalid use of concatenation operator '.' at position ${i + 1}.`);
            }
            continue;
        }

        /* Kleene Star '*' */
        if (current === REGEX_OPERATORS.STAR) {
            if (previous === null) {
                throw new Error("Kleene star '*' cannot appear at the beginning.");
            }
            if (!canEndExpression(previous)) {
                throw new Error(`Invalid use of '*' at position ${i + 1}.`);
            }
            if (previous === REGEX_OPERATORS.STAR) {
                throw new Error(`Multiple consecutive '*' operators at position ${i + 1}.`);
            }
            continue;
        }

        /* Symbols */
        if (isSymbol(current)) {
            continue;
        }

        /* Invalid character */
        throw new Error(`Invalid character '${current}' at position ${i + 1}.`);
    }

    /* Check balanced parentheses*/
    if (parenthesisBalance !== 0) {
        if (parenthesisBalance > 0) {
            throw new Error("Missing closing parenthesis ')'.");
        }
        throw new Error("Unexpected closing parenthesis ')'.");
    }
    return true;
}

/* TOKENIZE */
function tokenize(regex) {
    regex = regex.trim();
    const tokens = [...regex];
    return tokens;
}

/* STEP 3: ADD EXPLICIT CONCATENATION */
function addConcatenation(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; i++) {
        const current = tokens[i];
        result.push(current);
        if (i === tokens.length - 1) {
            continue;
        }
        const next = tokens[i + 1];
        if (canEndExpression(current) && canStartExpression(next)) {
            result.push(REGEX_OPERATORS.CONCAT);
        }
    }
    return result;
}

/* OPERATOR PRECEDENCE */
function getPrecedence(operator) {
    switch (operator) {
        case REGEX_OPERATORS.UNION:
            return 1;
        case REGEX_OPERATORS.CONCAT:
            return 2;
        case REGEX_OPERATORS.STAR:
            return 3;
        default:
            return 0;
    }
}

/* STEP 4: INFIX → POSTFIX */
function infixToPostfix(tokens) {
    const output = [];
    const operatorStack = [];

    for (const token of tokens) {
        /* Symbol */
        if (isSymbol(token)) {
            output.push(token);
            continue;
        }

        /* Opening parenthesis */
        if (token === OPEN_PAREN) {
            operatorStack.push(token);
            continue;
        }

        /* Closing parenthesis */
        if (token === CLOSE_PAREN) {
            while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== OPEN_PAREN) {
                output.push(operatorStack.pop());
            }
            if (operatorStack.length === 0) {
                throw new Error("Mismatched parentheses.");
            }
            // Remove '('
            operatorStack.pop();
            continue;
        }

        /* Operator */
        if (isOperator(token)) {
            while (operatorStack.length > 0 &&
                operatorStack[operatorStack.length - 1] !== OPEN_PAREN &&
                getPrecedence(operatorStack[operatorStack.length - 1]) >= getPrecedence(token)) {
                output.push(operatorStack.pop());
            }
            operatorStack.push(token);
            continue;
        }
    }

    /* Empty remaining operators */
    while (operatorStack.length > 0) {
        const operator = operatorStack.pop();
        if (operator === OPEN_PAREN || operator === CLOSE_PAREN) {
            throw new Error("Mismatched parentheses.");
        }
        output.push(operator);
    }
    return output;
}

/* COMPLETE REGEX PARSER */
function parseRegex(regex) {
    regex = regex.replace(/\s+/g, "");
    validateRegex(regex);
    const tokens = tokenize(regex);
    const concatenated = addConcatenation(tokens);
    const postfix = infixToPostfix(concatenated);
    return {tokens: tokens, concatenated: concatenated, postfix: postfix};
}

function formatTokens(tokens) {
    return tokens.join(" ");
}

function formatConcatenated(tokens) {
    return tokens.join(" ");
}

function formatPostfix(tokens) {
    return tokens.join("");
}