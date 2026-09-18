// import { Filter } from "lucide-react";

// import { Button } from "@/components/ui/button";
// import { Checkbox } from "@/components/ui/checkbox";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { cn } from "@/lib/utils";
// import {
//   NUMBER_OPS,
//   TEXT_OPS,
//   fieldByKey,
//   isEmptyFilter,
// } from "@/lib/appraisal-filters";

// export function ColumnFilter({
//   columnKey,
//   filter,
//   options,
//   onChange,

//   // ============================================================
//   // GROUP BY
//   // ============================================================

//   groupable = false,
//   groupDirection = null,
//   onGroupAsc,
//   onGroupDesc,
//   onClearGroup,
// }) {
//   const meta = fieldByKey(columnKey);

//   if (!meta) {
//     return null;
//   }

//   const filterActive = !!filter && !isEmptyFilter(filter);
//   const isGrouped = groupable && !!groupDirection;
//   const triggerActive = filterActive || isGrouped;

//   const current = filter
//     ? filter
//     : meta.kind === "enum"
//       ? { kind: "enum", values: [] }
//       : meta.kind === "number"
//         ? { kind: "number", op: "gt", value: "", value2: "" }
//         : { kind: "text", op: "contains", value: "" };

//   const textOperators =
//     columnKey === "empId" || columnKey === "name"
//       ? TEXT_OPS.filter((operator) => operator.value === "contains")
//       : TEXT_OPS;

//   return (
//     <Popover>
//       <PopoverTrigger asChild>
//         <button
//           type="button"
//           aria-label={`Filter ${meta.label}`}
//           className={cn(
//             "rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground",
//             triggerActive && "bg-primary/12 text-primary",
//           )}
//         >
//           <Filter className="size-3.5" />
//         </button>
//       </PopoverTrigger>

//       <PopoverContent align="start" className="w-72 space-y-3 p-3">
//         <p className="text-sm font-semibold">{meta.label}</p>

//         {groupable && (
//           <div className="flex items-center gap-1.5 border-b border-border pb-2">
//             <Button
//               type="button"
//               variant={groupDirection === "asc" ? "default" : "outline"}
//               size="sm"
//               className="h-7 flex-1 text-[11px]"
//               onClick={onGroupAsc}
//             >
//               Group ↑
//             </Button>

//             <Button
//               type="button"
//               variant={groupDirection === "desc" ? "default" : "outline"}
//               size="sm"
//               className="h-7 flex-1 text-[11px]"
//               onClick={onGroupDesc}
//             >
//               Group ↓
//             </Button>

//             {isGrouped && (
//               <Button
//                 type="button"
//                 variant="ghost"
//                 size="sm"
//                 className="h-7 px-2 text-[11px] text-muted-foreground"
//                 onClick={onClearGroup}
//               >
//                 Clear
//               </Button>
//             )}
//           </div>
//         )}

//         {current.kind === "enum" && (
//           <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
//             {options.map((opt) => (
//               <label
//                 key={opt}
//                 className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
//               >
//                 <Checkbox
//                   checked={current.values.includes(opt)}
//                   onCheckedChange={(checked) => {
//                     const values = checked
//                       ? [...current.values, opt]
//                       : current.values.filter((value) => value !== opt);

//                     onChange(
//                       values.length ? { kind: "enum", values } : undefined,
//                     );
//                   }}
//                 />

//                 <span className="truncate">{opt || "(blank)"}</span>
//               </label>
//             ))}
//           </div>
//         )}

//         {current.kind === "text" && (
//           <div className="space-y-2">
//             <Select
//               value={current.op}
//               onValueChange={(op) => {
//                 onChange({ ...current, kind: "text", op });
//               }}
//             >
//               <SelectTrigger className="h-8">
//                 <SelectValue />
//               </SelectTrigger>

//               <SelectContent>
//                 {textOperators.map((operator) => (
//                   <SelectItem key={operator.value} value={operator.value}>
//                     {operator.label}
//                   </SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>

//             <Input
//               className="h-8"
//               value={current.value}
//               placeholder="Value"
//               onChange={(event) => {
//                 onChange({
//                   ...current,
//                   kind: "text",
//                   value: event.target.value,
//                 });
//               }}
//             />
//           </div>
//         )}

//         {current.kind === "number" && (
//           <div className="space-y-2">
//             <Select
//               value={current.op}
//               onValueChange={(op) => {
//                 onChange({
//                   ...current,
//                   kind: "number",
//                   op,
//                   value: current.value !== undefined ? current.value : "",
//                   value2: current.value2 !== undefined ? current.value2 : "",
//                 });
//               }}
//             >
//               <SelectTrigger className="h-8">
//                 <SelectValue />
//               </SelectTrigger>

//               <SelectContent>
//                 {NUMBER_OPS.map((operator) => (
//                   <SelectItem key={operator.value} value={operator.value}>
//                     {operator.label}
//                   </SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>

//             <div className="flex items-center gap-2">
//               <div className="flex-1 space-y-1">
//                 <Label className="text-[11px] text-muted-foreground">
//                   {current.op === "between" ? "From" : "Value"}
//                 </Label>

//                 <Input
//                   className="h-8 num"
//                   type="number"
//                   value={current.value !== undefined ? current.value : ""}
//                   onChange={(event) => {
//                     onChange({
//                       ...current,
//                       kind: "number",
//                       value: event.target.value,
//                     });
//                   }}
//                 />
//               </div>

//               {current.op === "between" && (
//                 <div className="flex-1 space-y-1">
//                   <Label className="text-[11px] text-muted-foreground">
//                     To
//                   </Label>

//                   <Input
//                     className="h-8 num"
//                     type="number"
//                     value={current.value2 !== undefined ? current.value2 : ""}
//                     onChange={(event) => {
//                       onChange({
//                         ...current,
//                         kind: "number",
//                         value2: event.target.value,
//                       });
//                     }}
//                   />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         <div className="flex justify-end">
//           <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
//             Clear filter
//           </Button>
//         </div>
//       </PopoverContent>
//     </Popover>
//   );
// }

import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  NUMBER_OPS,
  TEXT_OPS,
  fieldByKey,
  isEmptyFilter,
} from "@/lib/appraisal-filters";

export function ColumnFilter({
  columnKey,
  filter,
  options,
  onChange,

  // ============================================================
  // GROUP BY
  // ============================================================

  groupable = false,
  groupDirection = null,
  onGroupAsc,
  onGroupDesc,
  onClearGroup,
}) {
  const meta = fieldByKey(columnKey);

  if (!meta) {
    return null;
  }

  const filterActive = !!filter && !isEmptyFilter(filter);
  const isGrouped = groupable && !!groupDirection;
  const triggerActive = filterActive || isGrouped;

  const current = filter
    ? filter
    : meta.kind === "enum"
      ? { kind: "enum", values: [] }
      : meta.kind === "number"
        ? { kind: "number", op: "gt", value: "", value2: "" }
        : { kind: "text", op: "contains", value: "" };

  const textOperators =
    columnKey === "empId" || columnKey === "name"
      ? TEXT_OPS.filter((operator) => operator.value === "contains")
      : TEXT_OPS;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${meta.label}`}
          className={cn(
            "rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground",
            triggerActive && "bg-primary/12 text-primary",
          )}
        >
          <Filter className="size-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <p className="text-sm font-semibold">{meta.label}</p>

        {groupable && (
          <div className="flex items-center gap-1.5 border-b border-border pb-2">
            <Button
              type="button"
              variant={groupDirection === "asc" ? "default" : "outline"}
              size="sm"
              className="h-7 flex-1 text-[11px]"
              onClick={onGroupAsc}
            >
              Group ↑
            </Button>

            <Button
              type="button"
              variant={groupDirection === "desc" ? "default" : "outline"}
              size="sm"
              className="h-7 flex-1 text-[11px]"
              onClick={onGroupDesc}
            >
              Group ↓
            </Button>

            {isGrouped && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={onClearGroup}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {current.kind === "enum" && (
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={current.values.includes(opt)}
                  onCheckedChange={(checked) => {
                    const values = checked
                      ? [...current.values, opt]
                      : current.values.filter((value) => value !== opt);

                    onChange(
                      values.length ? { kind: "enum", values } : undefined,
                    );
                  }}
                />

                <span className="truncate">{opt || "(blank)"}</span>
              </label>
            ))}
          </div>
        )}

        {current.kind === "text" && (
          <div className="space-y-2">
            <Select
              value={current.op}
              onValueChange={(op) => {
                onChange({ ...current, kind: "text", op });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {textOperators.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="h-8"
              value={current.value}
              placeholder="Value"
              onChange={(event) => {
                onChange({
                  ...current,
                  kind: "text",
                  value: event.target.value,
                });
              }}
            />
          </div>
        )}

        {current.kind === "number" && (
          <div className="space-y-2">
            <Select
              value={current.op}
              onValueChange={(op) => {
                onChange({
                  ...current,
                  kind: "number",
                  op,
                  value: current.value !== undefined ? current.value : "",
                  value2: current.value2 !== undefined ? current.value2 : "",
                });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {NUMBER_OPS.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {current.op === "between" ? "From" : "Value"}
                </Label>

                <Input
                  className="h-8 num"
                  type="number"
                  value={current.value !== undefined ? current.value : ""}
                  onChange={(event) => {
                    onChange({
                      ...current,
                      kind: "number",
                      value: event.target.value,
                    });
                  }}
                />
              </div>

              {current.op === "between" && (
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    To
                  </Label>

                  <Input
                    className="h-8 num"
                    type="number"
                    value={current.value2 !== undefined ? current.value2 : ""}
                    onChange={(event) => {
                      onChange({
                        ...current,
                        kind: "number",
                        value2: event.target.value,
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
