import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pageFromLocation,
  vendorFromLocation,
  vendorPath,
} from "../src/navigation.ts";

const index = "/mexica-new-year/vendors";
const id = "33333333-3333-4333-8333-333333333333";

test("vendor year and detail survive bookmarked URLs and login round trips", () => {
  for (const year of [2027, 2026]) {
    for (const vendorId of [null, id]) {
      const route = { year, id: vendorId };
      const path = vendorPath(route);
      assert.equal(
        path,
        index +
          (vendorId ? `/${vendorId}` : "") +
          (year === 2026 ? "?event_year=2026" : ""),
      );
      const direct = new URL(path, "http://localhost");
      const login = new URL(
        `/login?next=${encodeURIComponent(path)}`,
        "http://localhost",
      );
      for (const location of [direct, login]) {
        assert.equal(pageFromLocation(location), "Vendors");
        assert.deepEqual(vendorFromLocation(location), route);
      }
    }
  }
});

test("only workspace vendor paths and UUIDs are recognized", () => {
  for (const path of [
    `${index}/statistics`,
    `${index}/../settings`,
    `${index}/%2fsettings`,
    `${index}/12345`,
    `https://elsewhere.example${index}/${id}`,
    `//elsewhere.example${index}/${id}`,
  ]) {
    const login = new URL(
      `/login?next=${encodeURIComponent(path)}`,
      "http://localhost",
    );
    assert.equal(vendorFromLocation(login), null);
    assert.equal(pageFromLocation(login), "Home");
  }
});
