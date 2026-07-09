/** H5 人员档案 API 代理（TASK_DATA_SOURCE=db）。 */
const { isTaskDataFromDb, fetchDjangoJson } = require("./django-task");

async function fetchH5ProfileFromDb(employeeId, token) {
  const id = String(employeeId || "").trim();
  if (!id) {
    const err = new Error("employee_id_required");
    err.status = 400;
    throw err;
  }
  const qs = new URLSearchParams({ employee_no: id });
  return fetchDjangoJson(`/api/business/engineer/h5/profile/?${qs.toString()}`, { token });
}

async function postH5CertificatesToDb(body, token) {
  return fetchDjangoJson("/api/business/engineer/h5/profile/certificates/", {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

async function fetchUsersFromDb(query, token) {
  const q = query && typeof query === "object" ? query : {};
  const qs = new URLSearchParams();
  const role = String(q.role || "").trim();
  const employeeId = String(q.employeeId || "").trim();
  if (role) qs.set("role", role);
  if (employeeId) qs.set("employeeId", employeeId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return fetchDjangoJson(`/api/business/engineer/h5/users/${suffix}`, { token });
}

module.exports = {
  fetchH5ProfileFromDb,
  postH5CertificatesToDb,
  fetchUsersFromDb,
  isProfileDataFromDb: isTaskDataFromDb,
};
