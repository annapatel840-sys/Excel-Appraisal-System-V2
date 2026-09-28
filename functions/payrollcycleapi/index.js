"use strict";

const catalyst = require("zcatalyst-sdk-node");

const TABLES = {
  employees: "71873000000020001",
  employeeMaster: "71873000000020438",
  payroll: "71873000000020833",
  cycles: "71873000000030049",
  audit: "71873000000021235",
};
const PAGE_SIZE = 200;
const MAX_UPLOAD_ROWS = 5000;