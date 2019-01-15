import { RefObject, useContext, useMemo } from "react"
import { PanHandler, usePanGesture, PanInfo, PanHandlers } from "../gestures"
import { createLock, Lock } from "./utils/lock"
import { MotionValuesMap } from "../motion/utils/use-motion-values"
import { MotionContext } from "../motion/utils/MotionContext"
import { Point } from "../events"
import { MotionValue } from "../value"

type DragDirection = "x" | "y"
export interface DraggableProps {
    /**
     * Enable dragging for this element
     *
     * Set "x" or "y" to only drag in a specific direction
     *  @default false
     */
    dragEnabled?: boolean | DragDirection
    /**
     * Locks dragging direction
     * When dragging starts in a specific direction, do not allow dragging in the other direction
     * @default false
     */
    dragLocksDirection?: boolean
    /**
     * Disable global drag locking
     * When using nested dragging, setting this to true will enable parents to also drag
     * @default false
     */
    dragPropagation?: boolean
}

const draggableDefaults = (props: DraggableProps): Required<DraggableProps> => {
    const defaultValues = { dragEnabled: false, dragLocksDirection: false, dragPropagation: false }
    const result = defaultValues
    Object.assign(result, props)
    if (props.dragEnabled === undefined) {
        if (props.dragLocksDirection || props.dragPropagation) {
            result.dragEnabled = true
        }
    }
    return result
}

function defaults<Props>(
    props: Props,
    defaultProps: Required<Props> | ((props: Props) => Required<Props>)
): Required<Props> {
    let result: Required<Props>
    if (typeof defaultProps === "function") {
        result = defaultProps(props)
    } else {
        result = defaultProps
        Object.assign(result, props)
    }
    return result
}

function shouldDrag(
    direction: DragDirection,
    dragEnabled: boolean | DragDirection,
    currentDirection: null | DragDirection
) {
    return (
        (dragEnabled === true || dragEnabled === direction) &&
        (currentDirection === null || currentDirection === direction)
    )
}

export function useDraggable(props: DraggableProps, ref: RefObject<Element | null>, values: MotionValuesMap) {
    const { dragEnabled, dragPropagation, dragLocksDirection } = defaults(props, draggableDefaults)
    const point: Partial<{ x: MotionValue<number>; y: MotionValue<number> }> = {}
    let currentDirection: null | DragDirection = null
    if (shouldDrag("x", dragEnabled, currentDirection)) {
        point.x = values.get("x", 0)
    }
    if (shouldDrag("y", dragEnabled, currentDirection)) {
        point.y = values.get("y", 0)
    }
    const motionContext = useContext(MotionContext)
    // XXX: directionLocking and having something called Lock is confusing, especially, because they're not really realted
    let openGlobalLock: Lock = false

    const onPanStart = useMemo(
        () =>
            function() {
                if (!dragPropagation) {
                    openGlobalLock = getGlobalLock(dragEnabled)
                    if (!openGlobalLock) {
                        return
                    }
                }
                currentDirection = null
                motionContext.dragging = true
            },
        [dragEnabled, dragPropagation, motionContext]
    )

    const onPan: PanHandler = useMemo(
        () =>
            function(_event: MouseEvent | TouchEvent, { delta, offset }: PanInfo) {
                if (!dragPropagation && !openGlobalLock) {
                    return
                }
                if (dragLocksDirection) {
                    if (currentDirection === null) {
                        currentDirection = getCurrentDirection(offset)
                        return
                    }
                }
                const { x, y } = point
                if (shouldDrag("x", dragEnabled, currentDirection) && x) {
                    x.set(x.get() + delta.x)
                }
                if (shouldDrag("y", dragEnabled, currentDirection) && y) {
                    y.set(y.get() + delta.y)
                }
            },
        [openGlobalLock, dragEnabled, point]
    )
    const onPanEnd = useMemo(
        () =>
            function() {
                if (!dragPropagation && openGlobalLock) {
                    openGlobalLock()
                }
                motionContext.dragging = false
            },
        [openGlobalLock, motionContext, dragEnabled]
    )
    let handlers: PanHandlers = {}
    if (dragEnabled) {
        handlers = { onPanStart, onPan, onPanEnd }
    }
    usePanGesture(handlers, ref)
}

function getCurrentDirection(offset: Point): DragDirection | null {
    const lockThreshold = 10
    let direction: DragDirection | null = null
    if (Math.abs(offset.y) > lockThreshold) {
        direction = "y"
    } else if (Math.abs(offset.x) > lockThreshold) {
        direction = "x"
    }
    return direction
}

const globalHorizontalLock = createLock("dragHorizontal")
const globalVerticalLock = createLock("dragVertical")
function getGlobalLock(dragEnabled: boolean | "x" | "y"): Lock {
    let lock: Lock = false
    if (dragEnabled === "y") {
        lock = globalVerticalLock()
    } else if (dragEnabled === "x") {
        lock = globalHorizontalLock()
    } else {
        const openHorizontal = globalHorizontalLock()
        const openVertical = globalVerticalLock()
        if (openHorizontal && openVertical) {
            lock = () => {
                openHorizontal()
                openVertical()
            }
        } else {
            // Release the locks because we don't use them
            if (openHorizontal) openHorizontal()
            if (openVertical) openVertical()
        }
    }
    return lock
}
