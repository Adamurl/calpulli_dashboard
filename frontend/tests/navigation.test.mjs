import assert from "node:assert/strict";
import { pageFromLocation, pagePath } from "../src/navigation.ts";

const canonical = [
  ["Home", "/"],
  ["Inbox", "/inbox"],
  ["Presentations", "/presentations"],
  ["Drafts", "/presentations/drafts"],
  ["Clients", "/presentations/clients"],
  ["Templates", "/presentations/templates"],
  ["Settings", "/settings"],
];
let assertions = 0;
for (const [page, path] of canonical) {
  assert.equal(pagePath(page), path);
  assert.equal(
    pageFromLocation({ pathname: path, search: "", hash: "" }),
    page,
  );
  assert.equal(
    pageFromLocation({
      pathname: "/login",
      search: "?next=" + encodeURIComponent(path),
      hash: "",
    }),
    page,
  );
  assertions += 3;
}
for (const [page, path] of canonical.filter(([page]) =>
  ["Drafts", "Clients", "Templates"].includes(page),
)) {
  const alias = "/" + page.toLowerCase();
  assert.equal(
    pageFromLocation({ pathname: alias, search: "", hash: "" }),
    page,
  );
  assert.equal(
    pageFromLocation({
      pathname: "/",
      search: "",
      hash: "#" + page.toLowerCase(),
    }),
    page,
  );
  assert.equal(
    pageFromLocation({ pathname: "/", search: "", hash: "#" + path.slice(1) }),
    page,
  );
  assert.equal(
    pageFromLocation({
      pathname: "/login",
      search: "?next=" + encodeURIComponent(alias),
      hash: "",
    }),
    page,
  );
  assertions += 4;
}
for (const next of [
  "constructor",
  "toString",
  "__proto__",
  "https://example.org",
  "//example.org",
  "/unknown",
  "/presentations/templates?unsafe=1",
]) {
  assert.equal(
    pageFromLocation({
      pathname: "/login",
      search: "?next=" + encodeURIComponent(next),
      hash: "",
    }),
    "Home",
  );
  assertions++;
}
assert.equal(
  pageFromLocation({
    pathname: "/presentations",
    search: "",
    hash: "#unknown",
  }),
  "Presentations",
);
assertions++;
for (const path of ["/activity", "/presentations/activity"]) {
  assert.equal(
    pageFromLocation({ pathname: path, search: "", hash: "" }),
    "Presentations",
  );
  assert.equal(
    pageFromLocation({
      pathname: "/login",
      search: `?next=${encodeURIComponent(path)}`,
      hash: "",
    }),
    "Presentations",
  );
  assertions += 2;
}
assert.equal(
  pageFromLocation({ pathname: "/", search: "", hash: "#activity" }),
  "Presentations",
);
assertions++;
console.log(`${assertions} navigation assertions passed`);
