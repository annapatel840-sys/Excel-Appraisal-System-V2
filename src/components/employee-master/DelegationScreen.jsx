  const decide = async (q, approve, rm = remarks[q.id] || "") => {
    if (!approve && !rm.trim()) return say("HR remarks are mandatory when rejecting.", true);
    if (approve) {
      try {
        await persistDelegationChange(q);
      } catch (error) {
        return say(error?.message || "Unable to apply delegation change.", true);
      }
      setRows((rs) => applyTo(rs, q.rowId, q.field, q.newId, "HR Admin", q.reason, q.byName + " (approved by " + user.name + ")"));
    }
    setReqs((qs) => qs.map((x) => x.id === q.id ? { ...x, status: approve ? "Approved" : "Rejected", decidedBy: user.name, decidedOn: now(), remarks: rm.trim() } : x));
    log({ emp: q.empId, field: FIELDS[q.field], from: nameOf(q.oldId), to: nameOf(q.newId), action: approve ? "Approved" : "Rejected", why: rm });
    say("Request " + q.no + (approve ? " approved and saved." : " rejected."));
  };
  const withdraw = (q) =>