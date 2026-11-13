import assert from "node:assert/strict";
import { detailFromLocation, pageFromLocation } from "../src/navigation.ts";

const id = "11111111-1111-4111-8111-111111111111";
let assertions = 0;
for (const requestId of [id, "1048"]) {
  for (const trailing of ["", "/"]) {
    const path = `/presentations/${requestId}${trailing}`;
    for (const current of [
      { pathname: path, search: "", hash: "" },
      {
        pathname: "/login",
        search: `?next=${encodeURIComponent(path)}`,
        hash: "",
      },
    ]) {
      assert.equal(detailFromLocation(current), requestId);
      assert.equal(pageFromLocation(current), "Presentations");
      assertions += 2;
    }
  }
}
for (const segment of [
  "templates",
  "clients",
  "drafts",
  "activity",
  "../settings",
  "%2fsettings",
  "constructor",
  "__proto__",
  `${id}/emails`,
  `${id}?next=//example.org`,
]) {
  assert.equal(
    detailFromLocation({ pathname: `/presentations/${segment}`, search: "" }),
    null,
  );
  assertions++;
}
for (const path of [
  `https://example.org/presentations/${id}`,
  `//example.org/presentations/${id}`,
]) {
  assert.equal(
    detailFromLocation({
      pathname: "/login",
      search: `?next=${encodeURIComponent(path)}`,
    }),
    null,
  );
  assertions++;
}
console.log(`${assertions} detail navigation assertions passed`);
