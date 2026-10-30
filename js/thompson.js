class NFAState {
    constructor(id) {
        this.id = id;
        this.transitions = [];
    }
}

class NFAFragment {
    constructor(startState, acceptState, states) {
        this.startState = startState;
        this.acceptState = acceptState;
        this.states = states;
    }
}

/* THOMPSON CONSTRUCTION CLASS */
class ThompsonNFA {
    constructor() {
        this.states = [];
        this.nextStateId = 0;
        this.alphabet = new Set();
    }

    /* CREATE STATE */
    createState() {
        const state = new NFAState(this.nextStateId);
        this.states.push(state);
        this.nextStateId++;
        return state;
    }

    /* ADD TRANSITION */
    addTransition(fromState, toState, symbol) {
        fromState.transitions.push({
            symbol: symbol,
            to: toState.id
        });
        if (symbol !== "ε") {
            this.alphabet.add(symbol);
        }
    }

    /* CREATE SYMBOL FRAGMENT */
    createSymbolFragment(symbol) {
        const startState = this.createState();
        const acceptState = this.createState();
        this.addTransition(startState, acceptState, symbol);
        return new NFAFragment(startState, acceptState, [startState, acceptState]);
    }

    /* UNION A + B */
    union(fragmentA, fragmentB) {
        const startState = this.createState();
        const acceptState = this.createState();

        this.addTransition(startState, fragmentA.startState, "ε");
        this.addTransition(startState, fragmentB.startState, "ε");
        this.addTransition(fragmentA.acceptState, acceptState, "ε");
        this.addTransition(fragmentB.acceptState, acceptState, "ε");

        return new NFAFragment(
            startState,
            acceptState,
            [startState, ...fragmentA.states, ...fragmentB.states, acceptState]
        );
    }

    /* CONCATENATION A.B */
    concatenate(fragmentA, fragmentB) {
        this.addTransition(fragmentA.acceptState, fragmentB.startState, "ε");
        return new NFAFragment(
            fragmentA.startState,
            fragmentB.acceptState,
            [...fragmentA.states, ...fragmentB.states]
        );
    }

    /* KLEENE STAR A* */
    kleeneStar(fragment) {
        const startState = this.createState();
        const acceptState = this.createState();

        this.addTransition(startState, fragment.startState, "ε");
        this.addTransition(startState, acceptState, "ε");
        this.addTransition(fragment.acceptState, fragment.startState, "ε");
        this.addTransition(fragment.acceptState, acceptState, "ε");

        return new NFAFragment(
            startState,
            acceptState,
            [startState, ...fragment.states, acceptState]
        );
    }

    /* NORMALIZE STATE IDS */
    normalizeStates(startState, acceptState) {

        // Put the start state first and accept state last.
        const orderedStates = [
            startState,
            ...this.states.filter(state => state.id !== startState.id && state.id !== acceptState.id),
            acceptState
        ];

        // Create old ID -> new ID mapping.
        const stateMapping = new Map();
        orderedStates.forEach((state, index) => {stateMapping.set(state.id, index);});

        // Update state IDs and transition destinations.
        orderedStates.forEach((state, index) => {
            state.id = index;
            state.transitions.forEach(transition => {transition.to = stateMapping.get(transition.to);});
        });

        // Keep states in their new numerical order.
        this.states = orderedStates;
        return {
            startState: 0,
            acceptState: orderedStates.length - 1
        };
    }

    /* BUILD NFA FROM POSTFIX */
    buildFromPostfix(postfix) {
        const stack = [];
        for (const token of postfix) {

            /* SYMBOL */
            if (!isThompsonOperator(token)) {
                const fragment = this.createSymbolFragment(token);
                stack.push(fragment);
                continue;
            }

            /* UNION (+) */
            if (token === "+") {
                if (stack.length < 2) {
                    throw new Error("Invalid postfix expression: union requires two operands.");
                }
                const fragmentB = stack.pop();
                const fragmentA = stack.pop();
                const newFragment = this.union(fragmentA, fragmentB);
                stack.push(newFragment);
                continue;
            }

            /* CONCATENATION (.) */
            if (token === ".") {
                if (stack.length < 2) {
                    throw new Error("Invalid postfix expression: concatenation requires two operands.");
                }
                const fragmentB = stack.pop();
                const fragmentA = stack.pop();
                const newFragment = this.concatenate(fragmentA, fragmentB);
                stack.push(newFragment);
                continue;
            }

            /* KLEENE STAR (*) */
            if (token === "*") {
                if (stack.length < 1) {
                    throw new Error("Invalid postfix expression: Kleene star requires one operand.");
                }
                const fragment = stack.pop();
                const newFragment = this.kleeneStar(fragment);
                stack.push(newFragment);
                continue;
            }
        }

        /* FINAL STACK CHECK */
        if (stack.length !== 1) {
            throw new Error("Invalid postfix expression: incomplete or invalid expression.");
        }
        const finalFragment = stack.pop();

        /* NORMALIZE START AND ACCEPT STATES */
        const normalized = this.normalizeStates(finalFragment.startState, finalFragment.acceptState);

        return {
            states: this.states,
            alphabet: [...this.alphabet],
            startState: normalized.startState,
            acceptState: normalized.acceptState,
            transitions: this.getAllTransitions()
        };
    }

    /* GET ALL TRANSITIONS */
    getAllTransitions() {
        const transitions = [];
        for (const state of this.states) {
            for (const transition of state.transitions) {
                transitions.push({from: state.id, to: transition.to, symbol: transition.symbol});
            }
        }
        return transitions;
    }
}

/* OPERATOR CHECK */
function isThompsonOperator(token) {
    return (token === "+" || token === "." || token === "*");
}

/* BUILD THOMPSON NFA */
function buildThompsonNFA(postfix) {
    if (!Array.isArray(postfix)) {
        throw new Error("Postfix expression must be an array of tokens.");
    }
    if (postfix.length === 0) {
        throw new Error("Postfix expression cannot be empty.");
    }
    const thompson = new ThompsonNFA();
    return thompson.buildFromPostfix(postfix);
}
