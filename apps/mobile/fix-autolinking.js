#!/usr/bin/env node
/**
 * Fix for expo-modules-autolinking generating wrong import with pnpm
 * This script runs after `pnpm install` on EAS to patch the autolinking template
 */

const fs = require('fs');
const path = require('path');

// Path to the autolinking package template
const autolinkingPath = path.join(
  __dirname,
  'node_modules',
  'expo-modules-autolinking',
  'build',
  'platforms',
  'android'
);

const templateFile = path.join(autolinkingPath, 'packageListTemplate.txt');

if (fs.existsSync(templateFile)) {
  console.log('Patching expo-modules-autolinking template...');
  
  let content = fs.readFileSync(templateFile, 'utf8');
  
  // Replace the old import with the new one
  const oldImport = 'import expo.core.ExpoModulesPackage;';
  const newImport = 'import expo.modules.core.ExpoModulesPackage;';
  
  if (content.includes(oldImport)) {
    content = content.replace(oldImport, newImport);
    fs.writeFileSync(templateFile, content, 'utf8');
    console.log('✓ Patched autolinking template');
  } else if (content.includes(newImport)) {
    console.log('✓ Template already correct');
  } else {
    console.warn('⚠ Could not find import statement to patch');
  }
} else {
  console.warn('⚠ Autolinking template not found at:', templateFile);
}
