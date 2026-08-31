import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import {
    COLUMNS,
    COMPUTED_COLUMNS,
    inr,
} from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";


// ============================================================
// EDITABLE COLUMN INFORMATION
// ============================================================

const editableCols = COLUMNS.filter((c) => c.editable);

const editableIndex = new Map(
    editableCols.map((c, i) => [c.key, i])
);


// ============================================================
// MAIN COMPONENT
// ============================================================

export function AppraisalGrid({
    rows,
    filters,
    setFilter,
    optionsFor,
    selected,
    toggleSelected,
    toggleAll,
    onRowOpen,
}) {

    const {
        updateCell,
        modified,
    } = useAppraisal();

    const cellRefs = useRef({});

    const [active, setActive] = useState(null);

    const [saving, setSaving] = useState({});


    // ========================================================
    // FOCUS CELL
    // ========================================================

    const focusCell = useCallback((r, c) => {

        const el =
            cellRefs.current[`${r}:${c}`];

        if (el) {

            el.focus();

            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement
            ) {
                el.select();
            }
        }

    }, []);


    // ========================================================
    // SHOW SAVED INDICATOR
    // ========================================================

    const flashSaved = useCallback((key) => {

        setSaving((p) => ({
            ...p,
            [key]: Date.now(),
        }));

        setTimeout(() => {

            setSaving((p) => {

                const n = {
                    ...p,
                };

                delete n[key];

                return n;

            });

        }, 1200);

    }, []);


    // ========================================================
    // CONVERT VALUE BASED ON COLUMN TYPE
    // ========================================================

    const convertValue = useCallback(
        (col, raw) => {

            if (
                col.type === "currency" ||
                col.type === "number" ||
                col.type === "decimal" ||
                col.type === "percent"
            ) {

                if (
                    raw === "" ||
                    raw === null ||
                    raw === undefined
                ) {
                    return 0;
                }

                const cleaned =
                    String(raw)
                        .replace(/[^\d.-]/g, "");

                return Number(cleaned) || 0;
            }

            return raw;

        },
        []
    );


    // ========================================================
    // COMMIT VALUE
    // ========================================================

    const commit = useCallback(
        (row, col, raw) => {

            const value =
                convertValue(col, raw);

            if (
                String(row[col.key] ?? "") ===
                String(value ?? "")
            ) {
                return;
            }

            updateCell(
                row.id,
                col.key,
                value
            );

            flashSaved(
                `${row.id}:${col.key}`
            );

        },
        [
            convertValue,
            updateCell,
            flashSaved,
        ]
    );


    // ========================================================
    // KEYBOARD NAVIGATION
    // ========================================================

    const onKeyDown = (
        e,
        r,
        c
    ) => {

        const max =
            rows.length - 1;

        const maxC =
            editableCols.length - 1;

        const target =
            e.target;

        const value =
            target.value ?? "";

        const selectionStart =
            target.selectionStart;

        const selectionEnd =
            target.selectionEnd;

        const atStart =
            selectionStart === null ||
            selectionStart === 0;

        const atEnd =
            selectionEnd === null ||
            selectionEnd === value.length;


        // ----------------------------------------------------
        // ENTER
        // ----------------------------------------------------

        if (e.key === "Enter") {

            e.preventDefault();

            focusCell(
                e.shiftKey
                    ? Math.max(0, r - 1)
                    : Math.min(max, r + 1),
                c
            );

        }


        // ----------------------------------------------------
        // ARROW DOWN
        // ----------------------------------------------------

        else if (e.key === "ArrowDown") {

            e.preventDefault();

            focusCell(
                Math.min(max, r + 1),
                c
            );

        }


        // ----------------------------------------------------
        // ARROW UP
        // ----------------------------------------------------

        else if (e.key === "ArrowUp") {

            e.preventDefault();

            focusCell(
                Math.max(0, r - 1),
                c
            );

        }


        // ----------------------------------------------------
        // ARROW RIGHT
        // ----------------------------------------------------

        else if (
            e.key === "ArrowRight" &&
            atEnd
        ) {

            if (c < maxC) {

                e.preventDefault();

                focusCell(
                    r,
                    c + 1
                );
            }

        }


        // ----------------------------------------------------
        // ARROW LEFT
        // ----------------------------------------------------

        else if (
            e.key === "ArrowLeft" &&
            atStart
        ) {

            if (c > 0) {

                e.preventDefault();

                focusCell(
                    r,
                    c - 1
                );
            }

        }


        // ----------------------------------------------------
        // ESCAPE
        // ----------------------------------------------------

        else if (e.key === "Escape") {

            target.blur();

        }

    };


    // ========================================================
    // SELECT ALL
    // ========================================================

    const allSelected =
        rows.length > 0 &&
        rows.every(
            (r) => selected[r.id]
        );


    // ========================================================
    // HEADERS
    // ========================================================

    const headers = useMemo(
        () => [
            ...COLUMNS.map((c) => ({
                key: c.key,
                label: c.label,
                width: c.width,
                type: c.type,
            })),

            ...COMPUTED_COLUMNS.map(
                (c) => ({
                    key: c.key,
                    label: c.label,
                    width: c.width,
                    type: c.kind,
                })
            ),
        ],
        []
    );


    // ========================================================
    // RENDER EDITABLE CELL
    // ========================================================

    const renderEditableCell = (
        row,
        col,
        r,
        c,
        cellKey
    ) => {

        // ----------------------------------------------------
        // DROPDOWN
        // ----------------------------------------------------

        if (
            col.type === "enum"
        ) {

            return _jsx(
                "select",
                {
                    ref: (el) => {
                        cellRefs.current[
                            `${r}:${c}`
                        ] = el;
                    },

                    value:
                        String(
                            row[col.key] ?? ""
                        ),

                    onFocus: () => {
                        setActive(
                            `${r}:${c}`
                        );
                    },

                    onBlur: () => {
                        setActive(null);
                    },

                    onKeyDown: (e) => {
                        onKeyDown(
                            e,
                            r,
                            c
                        );
                    },

                    onChange: (e) => {

                        updateCell(
                            row.id,
                            col.key,
                            e.target.value
                        );

                        flashSaved(
                            cellKey
                        );

                    },

                    className:
                        "w-full cursor-pointer appearance-none bg-transparent px-3 py-2 text-sm outline-none",

                    children:
                        (col.options ?? [])
                            .map(
                                (o) =>
                                    _jsx(
                                        "option",
                                        {
                                            value: o,
                                            children: o,
                                        },
                                        o
                                    )
                            ),
                }
            );

        }


        // ----------------------------------------------------
        // MULTI-LINE TEXT
        // ----------------------------------------------------

        if (
            col.type === "textarea"
        ) {

            return _jsx(
                "textarea",
                {
                    ref: (el) => {
                        cellRefs.current[
                            `${r}:${c}`
                        ] = el;
                    },

                    defaultValue:
                        String(
                            row[col.key] ?? ""
                        ),

                    rows: 2,

                    onFocus: () => {
                        setActive(
                            `${r}:${c}`
                        );
                    },

                    onBlur: (e) => {

                        setActive(null);

                        commit(
                            row,
                            col,
                            e.target.value
                        );

                    },

                    onKeyDown: (e) => {

                        // Ctrl + Enter commits
                        if (
                            e.key === "Enter" &&
                            e.ctrlKey
                        ) {

                            e.preventDefault();

                            commit(
                                row,
                                col,
                                e.target.value
                            );

                            e.target.blur();
                        }

                    },

                    className:
                        "w-full min-h-[58px] resize-y bg-transparent px-3 py-2 text-sm outline-none",
                }
            );

        }


        // ----------------------------------------------------
        // DATE
        // ----------------------------------------------------

        if (
            col.type === "date"
        ) {

            return _jsx(
                "input",
                {
                    ref: (el) => {
                        cellRefs.current[
                            `${r}:${c}`
                        ] = el;
                    },

                    type: "date",

                    defaultValue:
                        String(
                            row[col.key] ?? ""
                        ),

                    onFocus: () => {
                        setActive(
                            `${r}:${c}`
                        );
                    },

                    onBlur: (e) => {

                        setActive(null);

                        commit(
                            row,
                            col,
                            e.target.value
                        );

                    },

                    onKeyDown: (e) => {

                        onKeyDown(
                            e,
                            r,
                            c
                        );

                    },

                    className:
                        "w-full bg-transparent px-3 py-2 text-sm outline-none",
                }
            );

        }


        // ----------------------------------------------------
        // TEXT / NUMBER / CURRENCY / DECIMAL / PERCENT
        // ----------------------------------------------------

        const isNumeric =
            col.type === "currency" ||
            col.type === "number" ||
            col.type === "decimal" ||
            col.type === "percent";

        return _jsxs(
            "div",
            {
                className:
                    "relative",

                children: [

                    _jsx(
                        "input",
                        {
                            ref: (el) => {
                                cellRefs.current[
                                    `${r}:${c}`
                                ] = el;
                            },

                            type:
                                isNumeric
                                    ? "number"
                                    : "text",

                            step:
                                col.type === "decimal" ||
                                col.type === "percent"
                                    ? "0.01"
                                    : "1",

                            defaultValue:
                                String(
                                    row[col.key] ?? ""
                                ),

                            inputMode:
                                isNumeric
                                    ? "decimal"
                                    : "text",

                            onFocus: (e) => {

                                setActive(
                                    `${r}:${c}`
                                );

                                e.currentTarget.select();

                            },

                            onBlur: (e) => {

                                setActive(null);

                                commit(
                                    row,
                                    col,
                                    e.target.value
                                );

                            },

                            onKeyDown: (e) => {

                                if (
                                    e.key === "Enter"
                                ) {

                                    commit(
                                        row,
                                        col,
                                        e.target.value
                                    );

                                }

                                onKeyDown(
                                    e,
                                    r,
                                    c
                                );

                            },

                            className: cn(
                                "w-full bg-transparent px-3 py-2 text-[13px] outline-none",
                                isNumeric
                                    ? "num text-right"
                                    : "text-left"
                            ),
                        },
                        `${cellKey}-${row[col.key]}`
                    ),

                    saving[cellKey] !==
                        undefined &&
                        _jsx(
                            "span",
                            {
                                className:
                                    "pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-status-submitted",

                                children:
                                    _jsx(
                                        Check,
                                        {
                                            className:
                                                "size-3.5",
                                        }
                                    ),
                            }
                        ),
                ],
            }
        );

    };


    // ========================================================
    // RENDER
    // ========================================================

    return _jsxs(
        "div",
        {
            className:
                "relative overflow-auto rounded-xl border border-border bg-card",

            style: {
                maxHeight:
                    "calc(100vh - 300px)",
            },

            children: [

                // ==================================================
                // TABLE
                // ==================================================

                _jsxs(
                    "table",
                    {
                        className:
                            "w-max border-separate border-spacing-0 text-sm",

                        children: [

                            // ==================================================
                            // HEADER
                            // ==================================================

                            _jsx(
                                "thead",
                                {
                                    className:
                                        "sticky top-0 z-30",

                                    children:
                                        _jsxs(
                                            "tr",
                                            {
                                                children: [

                                                    // SELECT ALL
                                                    _jsx(
                                                        "th",
                                                        {
                                                            className:
                                                                "sticky left-0 z-40 w-10 border-r border-b border-grid-line bg-grid-header px-2 py-2",

                                                            children:
                                                                _jsx(
                                                                    Checkbox,
                                                                    {
                                                                        checked:
                                                                            allSelected,

                                                                        onCheckedChange:
                                                                            (v) =>
                                                                                toggleAll(
                                                                                    !!v
                                                                                ),

                                                                        "aria-label":
                                                                            "Select all",
                                                                    }
                                                                ),
                                                        }
                                                    ),

                                                    // COLUMN HEADERS
                                                    headers.map(
                                                        (
                                                            h,
                                                            i
                                                        ) =>
                                                            _jsx(
                                                                "th",
                                                                {
                                                                    style: {
                                                                        width:
                                                                            h.width,

                                                                        minWidth:
                                                                            h.width,

                                                                        left:
                                                                            i ===
                                                                            0
                                                                                ? 40
                                                                                : i ===
                                                                                    1
                                                                                    ? 136
                                                                                    : undefined,
                                                                    },

                                                                    className:
                                                                        cn(
                                                                            "border-r border-b border-grid-line bg-grid-header px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase",

                                                                            i <
                                                                                2 &&
                                                                                "sticky z-40"
                                                                        ),

                                                                    children:
                                                                        _jsxs(
                                                                            "div",
                                                                            {
                                                                                className:
                                                                                    "flex items-center justify-between gap-1",

                                                                                children: [

                                                                                    _jsx(
                                                                                        "span",
                                                                                        {
                                                                                            className:
                                                                                                "truncate",

                                                                                            children:
                                                                                                h.label,
                                                                                        }
                                                                                    ),

                                                                                    _jsx(
                                                                                        ColumnFilter,
                                                                                        {
                                                                                            columnKey:
                                                                                                h.key,

                                                                                            filter:
                                                                                                filters[
                                                                                                    h.key
                                                                                                ],

                                                                                            options:
                                                                                                optionsFor(
                                                                                                    h.key
                                                                                                ),

                                                                                            onChange:
                                                                                                (
                                                                                                    f
                                                                                                ) =>
                                                                                                    setFilter(
                                                                                                        h.key,
                                                                                                        f
                                                                                                    ),
                                                                                        }
                                                                                    ),
                                                                                ],
                                                                            }
                                                                        ),
                                                                },
                                                                h.key
                                                            )
                                                    ),
                                                ],
                                            }
                                        ),
                                }
                            ),


                            // ==================================================
                            // BODY
                            // ==================================================

                            _jsxs(
                                "tbody",
                                {
                                    children: [

                                        rows.map(
                                            (
                                                row,
                                                r
                                            ) =>
                                                _jsxs(
                                                    "tr",
                                                    {
                                                        className:
                                                            "group transition-colors hover:bg-accent/40",

                                                        children: [

                                                            // ==================================================
                                                            // SELECT ROW
                                                            // ==================================================

                                                            _jsx(
                                                                "td",
                                                                {
                                                                    className:
                                                                        "sticky left-0 z-20 border-r border-b border-grid-line bg-card px-2 py-1 group-hover:bg-accent/40",

                                                                    children:
                                                                        _jsx(
                                                                            Checkbox,
                                                                            {
                                                                                checked:
                                                                                    !!selected[
                                                                                        row.id
                                                                                    ],

                                                                                onCheckedChange:
                                                                                    (
                                                                                        v
                                                                                    ) =>
                                                                                        toggleSelected(
                                                                                            row.id,
                                                                                            !!v
                                                                                        ),

                                                                                "aria-label":
                                                                                    `Select ${row.name}`,
                                                                            }
                                                                        ),
                                                                }
                                                            ),


                                                            // ==================================================
                                                            // NORMAL COLUMNS
                                                            // ==================================================

                                                            COLUMNS.map(
                                                                (
                                                                    col,
                                                                    ci
                                                                ) => {

                                                                    const cellKey =
                                                                        `${row.id}:${col.key}`;

                                                                    const isModified =
                                                                        !!modified[
                                                                            cellKey
                                                                        ];

                                                                    const c =
                                                                        editableIndex.get(
                                                                            col.key
                                                                        );

                                                                    const isActive =
                                                                        active ===
                                                                        `${r}:${c}`;

                                                                    const sticky =
                                                                        ci <
                                                                        2;


                                                                    return _jsxs(
                                                                        "td",
                                                                        {
                                                                            style: {
                                                                                width:
                                                                                    col.width,

                                                                                minWidth:
                                                                                    col.width,

                                                                                left:
                                                                                    ci ===
                                                                                    0
                                                                                        ? 40
                                                                                        : ci ===
                                                                                            1
                                                                                            ? 136
                                                                                            : undefined,
                                                                            },

                                                                            onDoubleClick:
                                                                                () =>
                                                                                    !col.editable &&
                                                                                    onRowOpen(
                                                                                        row
                                                                                    ),

                                                                            className:
                                                                                cn(
                                                                                    "relative border-r border-b border-grid-line px-0 py-0 align-middle",

                                                                                    sticky
                                                                                        ? "sticky z-20 bg-card group-hover:bg-accent/40"
                                                                                        : "bg-transparent",

                                                                                    isModified &&
                                                                                        "bg-cell-modified/70",

                                                                                    isActive &&
                                                                                        "ring-2 ring-primary ring-inset"
                                                                                ),

                                                                            children: [

                                                                                // ==================================================
                                                                                // READ ONLY
                                                                                // ==================================================

                                                                                !col.editable
                                                                                    ? _jsx(
                                                                                        "button",
                                                                                        {
                                                                                            type: "button",

                                                                                            onClick:
                                                                                                () =>
                                                                                                    onRowOpen(
                                                                                                        row
                                                                                                    ),

                                                                                            className:
                                                                                                cn(
                                                                                                    "block w-full truncate px-3 py-2 text-left",

                                                                                                    col.key ===
                                                                                                        "name" &&
                                                                                                        "font-medium text-foreground hover:text-primary",

                                                                                                    col.key ===
                                                                                                        "empId" &&
                                                                                                        "num text-xs text-muted-foreground",

                                                                                                    col.type ===
                                                                                                        "currency" &&
                                                                                                        "text-right num",

                                                                                                    col.type ===
                                                                                                        "number" &&
                                                                                                        "text-right num",

                                                                                                    col.type ===
                                                                                                        "decimal" &&
                                                                                                        "text-right num",

                                                                                                    col.type ===
                                                                                                        "percent" &&
                                                                                                        "text-right num"
                                                                                                ),

                                                                                            children:
                                                                                                col.type ===
                                                                                                "currency"
                                                                                                    ? inr(
                                                                                                        Number(
                                                                                                            row[
                                                                                                                col.key
                                                                                                            ] ??
                                                                                                                0
                                                                                                        )
                                                                                                    )
                                                                                                    : col.type ===
                                                                                                        "percent"
                                                                                                        ? `${Number(
                                                                                                            row[
                                                                                                                col.key
                                                                                                            ] ??
                                                                                                                0
                                                                                                        ).toFixed(
                                                                                                            1
                                                                                                        )}%`
                                                                                                        : col.type ===
                                                                                                            "decimal"
                                                                                                            ? Number(
                                                                                                                row[
                                                                                                                    col.key
                                                                                                                ] ??
                                                                                                                    0
                                                                                                            ).toFixed(
                                                                                                                3
                                                                                                            )
                                                                                                            : String(
                                                                                                                row[
                                                                                                                    col.key
                                                                                                                ] ??
                                                                                                                    ""
                                                                                                            ),
                                                                                        }
                                                                                    )

                                                                                    :

                                                                                    // ==================================================
                                                                                    // EDITABLE
                                                                                    // ==================================================

                                                                                    renderEditableCell(
                                                                                        row,
                                                                                        col,
                                                                                        r,
                                                                                        c,
                                                                                        cellKey
                                                                                    ),
                                                                            ],
                                                                        },
                                                                        col.key
                                                                    );

                                                                }
                                                            ),


                                                            // ==================================================
                                                            // COMPUTED COLUMNS
                                                            // ==================================================

                                                            COMPUTED_COLUMNS.map(
                                                                (
                                                                    c
                                                                ) =>
                                                                    _jsx(
                                                                        "td",
                                                                        {
                                                                            style: {
                                                                                width:
                                                                                    c.width,

                                                                                minWidth:
                                                                                    c.width,
                                                                            },

                                                                            className:
                                                                                cn(
                                                                                    "num border-r border-b border-grid-line px-3 py-2 text-right text-[13px] text-muted-foreground",

                                                                                    "bg-muted/20"
                                                                                ),

                                                                            children:
                                                                                c.kind ===
                                                                                "currency"
                                                                                    ? inr(
                                                                                        c.fn(
                                                                                            row
                                                                                        )
                                                                                    )
                                                                                    : c.kind ===
                                                                                        "percent"
                                                                                        ? `${Number(
                                                                                            c.fn(
                                                                                                row
                                                                                            ) || 0
                                                                                        ).toFixed(
                                                                                            1
                                                                                        )}%`
                                                                                        : Number(
                                                                                            c.fn(
                                                                                                row
                                                                                            ) || 0
                                                                                        ).toFixed(
                                                                                            2
                                                                                        ),
                                                                        },
                                                                        c.key
                                                                    )
                                                            ),
                                                        ],
                                                    },
                                                    row.id
                                                )
                                        ),


                                        // ==================================================
                                        // NO DATA
                                        // ==================================================

                                        rows.length ===
                                            0 &&
                                            _jsx(
                                                "tr",
                                                {
                                                    children:
                                                        _jsx(
                                                            "td",
                                                            {
                                                                colSpan:
                                                                    headers.length +
                                                                    1,

                                                                className:
                                                                    "px-6 py-16 text-center text-sm text-muted-foreground",

                                                                children:
                                                                    "No employees match the current filters.",
                                                            }
                                                        ),
                                                }
                                            ),
                                    ],
                                }
                            ),
                        ],
                    }
                ),


                // ==================================================
                // LOADING ICON
                // ==================================================

                _jsx(
                    "div",
                    {
                        className:
                            "pointer-events-none sticky bottom-0 left-0 hidden",

                        children:
                            _jsx(
                                Loader2,
                                {
                                    className:
                                        "size-3",
                                }
                            ),
                    }
                ),
            ],
        }
    );
}
