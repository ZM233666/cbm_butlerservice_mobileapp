const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAssignmentsStore,
  buildManagerDashboard,
  createAssignment,
} = require("../server/services/manager-dashboard");

test("normalizeAssignmentsStore should fallback FSE members", () => {
  const store = normalizeAssignmentsStore({});
  assert.equal(Array.isArray(store.fseMembers), true);
  assert.equal(store.fseMembers.length > 0, true);
  assert.equal(Array.isArray(store.assignments), true);
});

test("createAssignment should validate assignee and required fields", () => {
  const members = [{ employeeId: "2001", name: "A" }];
  const missingVehicle = createAssignment(
    { assignedToEmployeeId: "2001", maint: "c4c6", vehicleNo: "" },
    members
  );
  assert.equal(missingVehicle.error, "vehicle_required");
  const missingAssignee = createAssignment(
    { assignedToEmployeeId: "9999", maint: "c4c6", vehicleNo: "HXD1-1" },
    members
  );
  assert.equal(missingAssignee.error, "assignee_not_found");
});

test("buildManagerDashboard should aggregate overview and progress", () => {
  const store = {
    fseMembers: [{ employeeId: "2001", name: "A" }],
    assignments: [
      {
        id: "asg_1",
        maint: "c4c6",
        vehicleNo: "HXD1-1",
        deadline: "2026-04-12",
        status: "done",
        createdAt: "2026-04-01T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
      },
      {
        id: "asg_2",
        maint: "c1c3",
        vehicleNo: "HXD1-2",
        deadline: "2026-04-22",
        status: "todo",
        createdAt: "2026-04-02T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
      },
    ],
  };
  const out = buildManagerDashboard({
    store,
    month: "2026-04",
    records: [{ id: "r1", date: "2026-04-03" }],
  });
  assert.equal(out.overview.total, 2);
  assert.equal(out.overview.done, 1);
  assert.equal(out.progress.percentage, 50);
  assert.equal(out.monthlyServiceTotal, 2);
  assert.equal(out.vehiclesNeedService.length, 1);
});

test("buildManagerDashboard should scope data to current manager", () => {
  const store = {
    fseMembers: [{ employeeId: "2001", name: "A" }],
    assignments: [
      {
        id: "asg_1",
        maint: "c4c6",
        vehicleNo: "HXD1-1",
        deadline: "2026-04-12",
        status: "done",
        createdAt: "2026-04-01T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
      {
        id: "asg_2",
        maint: "c1c3",
        vehicleNo: "HXD1-2",
        deadline: "2026-04-22",
        status: "todo",
        createdAt: "2026-04-02T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_2", name: "Manager B" },
      },
    ],
  };
  const out = buildManagerDashboard({
    store,
    month: "2026-04",
    actorEmployeeId: "mgr_1",
  });
  assert.equal(out.overview.total, 1);
  assert.equal(out.overview.done, 1);
  assert.equal(out.monthlyServiceTotal, 1);
  assert.equal(out.assignments.length, 1);
  assert.equal(out.assignments[0].id, "asg_1");
});

test("buildManagerDashboard monthlyServiceTotal should count createdAt month", () => {
  const store = {
    fseMembers: [{ employeeId: "2001", name: "A" }],
    assignments: [
      {
        id: "asg_1",
        maint: "c4c6",
        vehicleNo: "HXD1-1",
        deadline: "2026-05-12",
        status: "todo",
        createdAt: "2026-04-01T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
      {
        id: "asg_2",
        maint: "c1c3",
        vehicleNo: "HXD1-2",
        deadline: "2026-04-22",
        status: "todo",
        createdAt: "2026-05-02T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
    ],
  };
  const out = buildManagerDashboard({
    store,
    month: "2026-04",
    actorEmployeeId: "mgr_1",
  });
  assert.equal(out.monthlyServiceTotal, 1);
});

test("buildManagerDashboard progress should follow selected month", () => {
  const store = {
    fseMembers: [{ employeeId: "2001", name: "A" }],
    assignments: [
      {
        id: "asg_1",
        maint: "c4c6",
        vehicleNo: "HXD1-1",
        deadline: "2026-04-12",
        status: "done",
        createdAt: "2026-04-01T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
      {
        id: "asg_2",
        maint: "c1c3",
        vehicleNo: "HXD1-2",
        deadline: "2026-04-22",
        status: "doing",
        createdAt: "2026-04-02T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
      {
        id: "asg_3",
        maint: "c1c3",
        vehicleNo: "HXD1-3",
        deadline: "2026-05-10",
        status: "todo",
        createdAt: "2026-05-02T00:00:00.000Z",
        assignedTo: { employeeId: "2001", name: "A" },
        createdBy: { employeeId: "mgr_1", name: "Manager A" },
      },
    ],
  };
  const out = buildManagerDashboard({
    store,
    month: "2026-04",
    actorEmployeeId: "mgr_1",
  });
  assert.equal(out.progress.done, 1);
  assert.equal(out.progress.doing, 1);
  assert.equal(out.progress.total, 2);
  assert.equal(out.progress.percentage, 50);
});
