const NFA_RENDERER_CONFIG = {
    stateRadius: 30,
    stateSpacing: 180,
    rowSpacing: 115,
    paddingX: 90,
    paddingY: 90,
    strokeWidth: 2.2,
    fontSize: 17,
    transitionFontSize: 16
};

const SVG_NS = "http://www.w3.org/2000/svg";

/* SVG HELPER */
function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, String(value));
    }
    return element;
}

/* NORMALIZE TRANSITION SYMBOL */
function getTransitionSymbol(symbol) {
    if (["epsilon", "ε", "e"].includes(symbol)) {
        return "ε";
    }
    return String(symbol);
}

/* CALCULATE VISUAL STATE LEVELS (DAG Longest Path) */
function calculateStateLevels(nfa) {
    const backEdges = new Set();
    const visited = new Set();
    const recStack = new Set();

    // 1. Detect cycle / backward edges using DFS
    function dfs(u) {
        visited.add(u);
        recStack.add(u);
        const outgoing = nfa.transitions.filter(t => t.from === u);
        for (const t of outgoing) {
            const v = t.to;
            if (recStack.has(v)) {
                backEdges.add(t);
            } else if (!visited.has(v)) {
                dfs(v);
            }
        }
        recStack.delete(u);
    }
    dfs(nfa.startState);

    // Also visit any unvisited states in DFS
    for (const state of nfa.states) {
        if (!visited.has(state.id)) {
            dfs(state.id);
        }
    }

    // 2. Compute in-degrees on forward DAG (excluding back edges)
    const inDegree = new Map();
    for (const state of nfa.states) {
        inDegree.set(state.id, 0);
    }
    for (const t of nfa.transitions) {
        if (!backEdges.has(t)) {
            inDegree.set(t.to, (inDegree.get(t.to) || 0) + 1);
        }
    }

    // 3. Topological sort using Kahn's algorithm
    const topo = [];
    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) {
            queue.push(id);
        }
    }
    while (queue.length > 0) {
        const u = queue.shift();
        topo.push(u);
        const outgoing = nfa.transitions.filter(t => t.from === u && !backEdges.has(t));
        for (const t of outgoing) {
            const newDeg = inDegree.get(t.to) - 1;
            inDegree.set(t.to, newDeg);
            if (newDeg === 0) {
                queue.push(t.to);
            }
        }
    }

    // 4. Compute longest path levels on DAG
    const levels = new Map();
    for (const state of nfa.states) {
        levels.set(state.id, 0);
    }
    levels.set(nfa.startState, 0);
    for (const u of topo) {
        const curLevel = levels.get(u);
        const outgoing = nfa.transitions.filter(t => t.from === u && !backEdges.has(t));
        for (const t of outgoing) {
            const nextLevel = levels.get(t.to);
            if (curLevel + 1 > nextLevel) {
                levels.set(t.to, curLevel + 1);
            }
        }
    }

    // 5. Place any unreached states sequentially
    let maxLevel = 0;
    for (const level of levels.values()) {
        maxLevel = Math.max(maxLevel, level);
    }
    for (const state of nfa.states) {
        if (!topo.includes(state.id)) {
            maxLevel++;
            levels.set(state.id, maxLevel);
        }
    }

    // Attach backEdges set to levels Map for renderer convenience
    levels.backEdges = backEdges;
    return levels;
}

/* RENDER NFA */
function renderNFA(nfa, containerId = "nfaGraph") {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`NFA container "#${containerId}" was not found.`);
    }
    if (!nfa || !Array.isArray(nfa.states) || !Array.isArray(nfa.transitions)) {
        throw new Error("Invalid NFA data.");
    }
    if (nfa.states.length === 0) {
        throw new Error("The NFA has no states.");
    }
    if (!nfa.states.some(state => state.id === nfa.startState) || !nfa.states.some(state => state.id === nfa.acceptState)) {
        throw new Error("Invalid start or accept state.");
    }

    container.replaceChildren();

    const radius = NFA_RENDERER_CONFIG.stateRadius;
    const spacing = NFA_RENDERER_CONFIG.stateSpacing;
    const rowSpacing = NFA_RENDERER_CONFIG.rowSpacing;
    const paddingX = NFA_RENDERER_CONFIG.paddingX;
    const paddingY = NFA_RENDERER_CONFIG.paddingY;

    // Keep state IDs unchanged. Only visual coordinates change.
    const states = [...nfa.states].sort((a, b) => a.id - b.id);
    const levels = calculateStateLevels(nfa);
    const backEdges = levels.backEdges || new Set();

    // Group states according to calculated levels.
    const levelGroups = new Map();
    for (const state of states) {
        const level = levels.get(state.id);
        if (!levelGroups.has(level)) {
            levelGroups.set(level, []);
        }
        levelGroups.get(level).push(state);
    }

    const maxLevel = Math.max(...levels.values());
    const maxRows = Math.max(...Array.from(levelGroups.values()).map(group => group.length));
    const baseHeight = Math.max(300, paddingY * 2 + (maxRows - 1) * rowSpacing + radius * 2);
    const centerY = baseHeight / 2;

    /* CALCULATE STATE POSITIONS */
    const positions = new Map();
    for (const [level, group] of levelGroups.entries()) {
        group.sort((a, b) => a.id - b.id);
        const totalHeight = (group.length - 1) * rowSpacing;
        group.forEach((state, index) => {
            const x = paddingX + radius + level * spacing;
            const y = centerY - totalHeight / 2 + index * rowSpacing;
            positions.set(state.id, { x, y });
        });
    }

    /* CLASSIFY TRANSITIONS FOR ROUTING */
    const topCurves = [];
    const bottomCurves = [];
    const straightTransitions = [];

    // Count transitions between identical state pairs
    const pairMap = new Map();
    for (const transition of nfa.transitions) {
        const key = `${transition.from}->${transition.to}`;
        if (!pairMap.has(key)) {
            pairMap.set(key, []);
        }
        pairMap.get(key).push(transition);
    }

    for (const transition of nfa.transitions) {
        const fromLevel = levels.get(transition.from);
        const toLevel = levels.get(transition.to);
        const fromPos = positions.get(transition.from);
        const toPos = positions.get(transition.to);
        if (!fromPos || !toPos) continue;

        const pairKey = `${transition.from}->${transition.to}`;
        const siblings = pairMap.get(pairKey);
        const siblingIndex = siblings.indexOf(transition);

        if (transition.from === transition.to) {
            topCurves.push({ transition, type: "self", span: 0, siblingIndex });
        } 
        else if (backEdges.has(transition) || toLevel < fromLevel) {
            bottomCurves.push({ transition, type: "back", span: fromPos.x - toPos.x, siblingIndex });
        } 
        else if (toLevel - fromLevel > 1) {
            topCurves.push({ transition, type: "skip", span: toPos.x - fromPos.x, siblingIndex });
        } 
        else if (siblings.length > 1) {
            if (siblingIndex === 0) {
                straightTransitions.push({ transition, parallelOffset: -16 });
            }
             else if (siblingIndex === 1) {
                straightTransitions.push({ transition, parallelOffset: 16 });
            } 
            else {
                topCurves.push({ transition, type: "skip", span: toPos.x - fromPos.x, siblingIndex });
            }
        } 
        else {
            straightTransitions.push({ transition, parallelOffset: 0 });
        }
    }

    /* ASSIGN NON-OVERLAPPING LANES FOR ARCHES */
    function assignLanes(curves, getInterval) {
        curves.sort((a, b) => (a.span || 0) - (b.span || 0));
        const laneIntervals = [];
        for (const curve of curves) {
            const [minX, maxX] = getInterval(curve);
            let assignedLane = -1;
            for (let l = 0; l < laneIntervals.length; l++) {
                const overlaps = laneIntervals[l].some(([sX, eX]) => !(maxX < sX || minX > eX));
                if (!overlaps) {
                    assignedLane = l;
                    laneIntervals[l].push([minX, maxX]);
                    break;
                }
            }
            if (assignedLane === -1) {
                assignedLane = laneIntervals.length;
                laneIntervals.push([[minX, maxX]]);
            }
            curve.lane = assignedLane;
        }
    }

    assignLanes(topCurves, c => {
        const p1 = positions.get(c.transition.from).x;
        const p2 = positions.get(c.transition.to).x;
        return [Math.min(p1, p2), Math.max(p1, p2)];
    });

    assignLanes(bottomCurves, c => {
        const p1 = positions.get(c.transition.from).x;
        const p2 = positions.get(c.transition.to).x;
        return [Math.min(p1, p2), Math.max(p1, p2)];
    });

    // Helper: query bounding Y of states between x1 and x2
    function getStatesYRange(x1, x2) {
        const minX = Math.min(x1, x2) - 5;
        const maxX = Math.max(x1, x2) + 5;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const pos of positions.values()) {
            if (pos.x >= minX && pos.x <= maxX) {
                minY = Math.min(minY, pos.y - radius);
                maxY = Math.max(maxY, pos.y + radius);
            }
        }
        return { minY, maxY };
    }

    let minOverallY = Infinity;
    let maxOverallY = -Infinity;
    for (const pos of positions.values()) {
        minOverallY = Math.min(minOverallY, pos.y - radius);
        maxOverallY = Math.max(maxOverallY, pos.y + radius);
    }

    const renderedPaths = [];

    /* BUILD TOP CURVES (Skip edges & Self-loops) */
    for (const curve of topCurves) {
        const t = curve.transition;
        const from = positions.get(t.from);
        const to = positions.get(t.to);
        const symbol = getTransitionSymbol(t.symbol);

        if (curve.type === "self") {
            const archY = from.y - radius - 55 - curve.lane * 35;
            minOverallY = Math.min(minOverallY, archY - 25);
            const startX = from.x - 12;
            const startY = from.y - radius + 4;
            const endX = from.x + 12;
            const endY = from.y - radius + 4;
            const d = `M ${startX} ${startY} C ${from.x - 45} ${archY}, ${from.x + 45} ${archY}, ${endX} ${endY}`;
            renderedPaths.push({ d, symbol, labelX: from.x, labelY: archY - 10 });
        } 
        else {
            const { minY } = getStatesYRange(from.x, to.x);
            const archY = minY - (50 + curve.lane * 38);
            minOverallY = Math.min(minOverallY, archY - 25);

            // Depart from top-right quadrant, arrive at top-left quadrant
            const startAngle = -60 * Math.PI / 180;
            const endAngle = -120 * Math.PI / 180;
            const startX = from.x + radius * Math.cos(startAngle);
            const startY = from.y + radius * Math.sin(startAngle);
            const endX = to.x + radius * Math.cos(endAngle);
            const endY = to.y + radius * Math.sin(endAngle);

            const dx = endX - startX;
            const cp1X = startX + dx * 0.25;
            const cp2X = endX - dx * 0.25;
            const d = `M ${startX} ${startY} C ${cp1X} ${archY}, ${cp2X} ${archY}, ${endX} ${endY}`;
            renderedPaths.push({ d, symbol, labelX: (startX + endX) / 2, labelY: archY - 10 });
        }
    }

    /* BUILD BOTTOM CURVES (Backward loop edges) */
    for (const curve of bottomCurves) {
        const t = curve.transition;
        const from = positions.get(t.from);
        const to = positions.get(t.to);
        const symbol = getTransitionSymbol(t.symbol);
        const { maxY } = getStatesYRange(from.x, to.x);
        const archY = maxY + (50 + curve.lane * 38);
        maxOverallY = Math.max(maxOverallY, archY + 25);

        // Depart from bottom-left quadrant, arrive at bottom-right quadrant
        const startAngle = 120 * Math.PI / 180;
        const endAngle = 60 * Math.PI / 180;
        const startX = from.x + radius * Math.cos(startAngle);
        const startY = from.y + radius * Math.sin(startAngle);
        const endX = to.x + radius * Math.cos(endAngle);
        const endY = to.y + radius * Math.sin(endAngle);
        const dx = startX - endX;
        const cp1X = startX - dx * 0.25;
        const cp2X = endX + dx * 0.25;
        const d = `M ${startX} ${startY} C ${cp1X} ${archY}, ${cp2X} ${archY}, ${endX} ${endY}`;
        renderedPaths.push({ d, symbol, labelX: (startX + endX) / 2, labelY: archY + 18 });
    }

    /* BUILD STRAIGHT TRANSITIONS */
    for (const item of straightTransitions) {
        const t = item.transition;
        const from = positions.get(t.from);
        const to = positions.get(t.to);
        const symbol = getTransitionSymbol(t.symbol);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);

        let startX = from.x + (dx / dist) * radius;
        let startY = from.y + (dy / dist) * radius;
        let endX = to.x - (dx / dist) * radius;
        let endY = to.y - (dy / dist) * radius;

        if (item.parallelOffset !== 0) {
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2 + item.parallelOffset;
            const d = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
            const labelY = item.parallelOffset < 0 ? midY - 10 : midY + 16;
            renderedPaths.push({ d, symbol, labelX: midX, labelY });
        } 
        else {
            const d = `M ${startX} ${startY} L ${endX} ${endY}`;
            renderedPaths.push({d, symbol, labelX: (startX + endX) / 2, labelY: (startY + endY) / 2 - 14});
        }
    }

    /* CALCULATE BOUNDING BOX & VIEWS */
    const svgWidth = paddingX * 2 + maxLevel * spacing + radius * 2;
    const paddingCanvasY = 32;
    const viewBoxY = minOverallY - paddingCanvasY;
    const viewBoxHeight = (maxOverallY - minOverallY) + paddingCanvasY * 2;

    const svg = createSvgElement("svg", {
        id: "nfaSvg",
        viewBox: `0 ${viewBoxY} ${svgWidth} ${viewBoxHeight}`,
        width: svgWidth,
        height: viewBoxHeight,
        role: "img",
        "aria-label": "Nondeterministic finite automaton diagram"
    });

    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.overflow = "visible";
    svg.style.margin = "0 auto";

    /* ARROWHEAD */
    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
        id: "nfaArrowhead",
        markerWidth: 10,
        markerHeight: 10,
        refX: 8,
        refY: 4,
        orient: "auto",
        markerUnits: "userSpaceOnUse"
    });
    marker.appendChild(createSvgElement("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#333" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    /* BACKGROUND */
    svg.appendChild(createSvgElement("rect", {
        x: 0,
        y: viewBoxY,
        width: svgWidth,
        height: viewBoxHeight,
        fill: "#fafafa"
    }));

    /* TRANSITION AND STATE LAYERS */
    const transitionLayer = createSvgElement("g");
    const stateLayer = createSvgElement("g");
    svg.appendChild(transitionLayer);
    svg.appendChild(stateLayer);

    /* START ARROW */
    const startPosition = positions.get(nfa.startState);
    if (startPosition) {
        transitionLayer.appendChild(
            createSvgElement("path", {
                d: `M ${startPosition.x - radius - 48} ${startPosition.y} L ${startPosition.x - radius - 3} ${startPosition.y}`,
                fill: "none",
                stroke: "#333",
                "stroke-width": NFA_RENDERER_CONFIG.strokeWidth,
                "marker-end": "url(#nfaArrowhead)"
            })
        );
    }

    /* DRAW ALL TRANSITIONS & LABELS */
    for (const item of renderedPaths) {
        const path = createSvgElement("path", {
            d: item.d,
            fill: "none",
            stroke: "#333",
            "stroke-width": NFA_RENDERER_CONFIG.strokeWidth,
            "marker-end": "url(#nfaArrowhead)"
        });
        transitionLayer.appendChild(path);

        const label = createSvgElement("text", {
            x: item.labelX,
            y: item.labelY,
            "text-anchor": "middle",
            "font-size": NFA_RENDERER_CONFIG.transitionFontSize,
            "font-family": "Arial, sans-serif",
            "font-weight": "normal",
            fill: "#222",
            stroke: "#fafafa",
            "stroke-width": 4,
            "paint-order": "stroke"
        });
        label.textContent = item.symbol;
        transitionLayer.appendChild(label);
    }

    /* DRAW STATES */
    for (const state of states) {
        const position = positions.get(state.id);
        const isAcceptState = state.id === nfa.acceptState;
        const group = createSvgElement("g", {
            class: isAcceptState
                ? "nfa-state nfa-final-state"
                : "nfa-state",
            "data-state-id": state.id
        });

        /* OUTER CIRCLE */
        group.appendChild(
            createSvgElement("circle", {
                cx: position.x,
                cy: position.y,
                r: radius,
                fill: "#fff",
                stroke: isAcceptState ? "#16a34a" : "#222",
                "stroke-width": 2.5
            })
        );

        /* INNER CIRCLE FOR FINAL STATE */
        if (isAcceptState) {
            group.appendChild(
                createSvgElement("circle", {
                    cx: position.x,
                    cy: position.y,
                    r: radius - 5,
                    fill: "none",
                    stroke: "#16a34a",
                    "stroke-width": 2
                })
            );
        }

        /* STATE NUMBER */
        const label = createSvgElement("text", {
            class: "nfa-state-label",
            x: position.x,
            y: position.y,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": NFA_RENDERER_CONFIG.fontSize,
            "font-family": "Arial, sans-serif",
            "font-weight": "normal",
            fill: "#222"
        });
        label.textContent = String(state.id);
        group.appendChild(label);
        stateLayer.appendChild(group);
    }

    container.appendChild(svg);
    return svg;
}
