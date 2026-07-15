import { boardFor, keyFor } from "./keyboardLayout"

export type Hand = "left" | "right"
export type AssignedFinger = "pinky" | "ring" | "middle" | "index"
export type RollDirection = "inward" | "outward" | "none"
export type MovementKind = "same-finger" | "row-reach" | "inward-roll" | "outward-roll"

export interface PrescribedKeyPosition {
    readonly row: number
    readonly column: number
    readonly hand: Hand
    readonly assignedFinger: AssignedFinger
}

export interface MovementClassification {
    readonly from: PrescribedKeyPosition
    readonly to: PrescribedKeyPosition
    readonly rowChange: number
    readonly sameFinger: boolean
    readonly reach: boolean
    readonly roll: RollDirection
    readonly kind: MovementKind | null
}

const positionsByLayout = new Map<string, Map<string, PrescribedKeyPosition>>()

function prescribedAssignment(column: number): Pick<PrescribedKeyPosition, "hand" | "assignedFinger"> {
    if (column <= 0) return { hand: "left", assignedFinger: "pinky" }
    if (column === 1) return { hand: "left", assignedFinger: "ring" }
    if (column === 2) return { hand: "left", assignedFinger: "middle" }
    if (column <= 4) return { hand: "left", assignedFinger: "index" }
    if (column <= 6) return { hand: "right", assignedFinger: "index" }
    if (column === 7) return { hand: "right", assignedFinger: "middle" }
    if (column === 8) return { hand: "right", assignedFinger: "ring" }
    return { hand: "right", assignedFinger: "pinky" }
}

function positionsFor(layout: string): Map<string, PrescribedKeyPosition> {
    const cached = positionsByLayout.get(layout)
    if (cached) return cached
    const board = boardFor(layout)
    const positions = new Map<string, PrescribedKeyPosition>()
    board.rows.forEach((row, rowIndex) => {
        const hasLeadingNumberKey = rowIndex === 0 && !/^\d$/u.test(row[0]?.base ?? "") && /^\d$/u.test(row[1]?.base ?? "")
        const isoBottomOffset = rowIndex === 3 && board.shape === "iso" ? 1 : 0
        row.forEach((cap, capIndex) => {
            const column = capIndex - (hasLeadingNumberKey || isoBottomOffset ? 1 : 0)
            positions.set(cap.base, { row: rowIndex, column, ...prescribedAssignment(column) })
        })
    })
    positionsByLayout.set(layout, positions)
    return positions
}

const FINGER_RANK: Record<AssignedFinger, number> = {
    pinky: 0,
    ring: 1,
    middle: 2,
    index: 3,
}

// Conventional layout geometry only: this never claims which finger someone
// actually used for a recorded keystroke.
export function classifyMovement(fromChar: string, toChar: string, layout: string): MovementClassification | null {
    const fromKey = keyFor(fromChar, layout)
    const toKey = keyFor(toChar, layout)
    if (!fromKey || !toKey || fromKey === " " || toKey === " ") return null
    const positions = positionsFor(layout)
    const from = positions.get(fromKey)
    const to = positions.get(toKey)
    if (!from || !to) return null

    const rowChange = to.row - from.row
    const sameHand = from.hand === to.hand
    const sameFinger = sameHand && from.assignedFinger === to.assignedFinger
    const reach = rowChange !== 0
    const rankChange = FINGER_RANK[to.assignedFinger] - FINGER_RANK[from.assignedFinger]
    const roll: RollDirection = !sameHand || rankChange === 0
        ? "none"
        : rankChange > 0 ? "inward" : "outward"
    const kind: MovementKind | null = sameFinger
        ? "same-finger"
        : reach
            ? "row-reach"
            : roll === "inward"
                ? "inward-roll"
                : roll === "outward" ? "outward-roll" : null

    return { from, to, rowChange, sameFinger, reach, roll, kind }
}
