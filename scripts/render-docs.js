#!/usr/bin/env node

const { loadCatalogData } = require('../lib/catalog-data.cjs');
const { writeGeneratedDocs } = require('../lib/render-docs.cjs');

const data = loadCatalogData();
writeGeneratedDocs(data);

console.log(`Rendered docs for ${data.skills.length} skills.`);
