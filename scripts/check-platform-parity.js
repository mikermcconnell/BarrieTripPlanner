#!/usr/bin/env node
/**
 * Platform Parity Check Script
 *
 * Scans src/ for .web.js files and their native counterparts,
 * comparing shared hook imports, exported prop interfaces, and handler names.
 * Reports drift as warnings (some divergence is intentional).
 *
 * Usage: node scripts/check-platform-parity.js
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const HANDLER_NAME_PATTERN = /^(handle\w+|on[A-Z]\w+|use\w+|enter\w+|exit\w+|reset\w+|swap\w+|fit\w+|view\w+|start\w+|format\w+)$/;
const HOOK_EQUIVALENTS = {
  'screens/NavigationScreen': {
    webProvidesForNative: {
      useNavigationLocation: ['useWebLocation'],
    },
  },
};

// Recursively find all .web.js files
function findWebFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findWebFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.web.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Extract import statements that reference hooks/
function extractHookImports(content) {
  const imports = new Set();
  const regex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*hooks[^'"]*)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    names.forEach(n => imports.add(n));
  }
  return imports;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDefaultExportName(content, fallbackName) {
  const directFunctionMatch = content.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(/);
  if (directFunctionMatch) return directFunctionMatch[1];

  const directNameMatch = content.match(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/);
  if (directNameMatch) return directNameMatch[1];

  return fallbackName;
}

// Extract prop names from a specific component function signature
function extractPropNames(content, componentName) {
  const props = new Set();

  const name = escapeRegExp(componentName);
  // Match: const Component = ({ prop1, prop2, ... }) =>
  const arrowMatch = content.match(new RegExp(`const\\s+${name}\\s*=\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)\\s*=>`));
  // Match: function Component({ prop1, prop2, ... })
  const funcMatch = content.match(new RegExp(`function\\s+${name}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`));
  const match = arrowMatch || funcMatch;

  if (match) {
    match[1].split(',').forEach(p => {
      let propName = p.trim().split(/\s*[=:]/)[0].trim();
      propName = propName.replace(/^\.\.\./, '').trim();
      if (propName) props.add(propName);
    });
  }

  return props;
}

// Extract handler/function names (const handleX = ..., const onX = ...)
function extractHandlerNames(content) {
  const handlers = new Set();
  const regex = /const\s+(handle\w+|on[A-Z]\w+|use\w+|enter\w+|exit\w+|reset\w+|swap\w+|fit\w+|view\w+|start\w+|format\w+)\s*=/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    handlers.add(match[1]);
  }

  // Also pick handlers returned from object destructuring:
  // const { handleMapPress, startTracking } = useSomething(...)
  const destructureRegex = /const\s+\{([^}]+)\}\s*=\s*[^;]+/g;
  while ((match = destructureRegex.exec(content)) !== null) {
    const names = match[1].split(',').map((token) => {
      // Supports patterns like "key: alias", "name = default", "...rest"
      const withoutDefault = token.split('=')[0].trim();
      const alias = withoutDefault.includes(':')
        ? withoutDefault.split(':').pop().trim()
        : withoutDefault.trim();
      return alias.replace(/^\.\.\./, '').trim();
    });
    names.forEach((name) => {
      if (HANDLER_NAME_PATTERN.test(name)) {
        handlers.add(name);
      }
    });
  }

  return handlers;
}

function extractLocalHookNames(content) {
  const hooks = new Set();
  let match;

  const constRegex = /const\s+(use[A-Z]\w*)\s*=/g;
  while ((match = constRegex.exec(content)) !== null) {
    hooks.add(match[1]);
  }

  const functionRegex = /function\s+(use[A-Z]\w*)\s*\(/g;
  while ((match = functionRegex.exec(content)) !== null) {
    hooks.add(match[1]);
  }

  return hooks;
}

function setDifference(a, b) {
  return new Set([...a].filter(x => !b.has(x)));
}

function main() {
  const webFiles = findWebFiles(SRC_DIR);

  if (webFiles.length === 0) {
    console.log('No .web.js files found in src/');
    return;
  }

  let totalWarnings = 0;
  const pairs = [];

  for (const webPath of webFiles) {
    const nativePath = webPath.replace(/\.web\.js$/, '.js');
    const relWeb = path.relative(SRC_DIR, webPath);
    const relNative = path.relative(SRC_DIR, nativePath);

    if (!fs.existsSync(nativePath)) {
      console.log(`\n  [INFO] ${relWeb} — no native counterpart (web-only file)`);
      continue;
    }

    pairs.push({ webPath, nativePath, relWeb, relNative });
  }

  console.log(`\nPlatform Parity Report`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Found ${pairs.length} platform file pairs\n`);

  for (const { webPath, nativePath, relWeb, relNative } of pairs) {
    const webContent = fs.readFileSync(webPath, 'utf-8');
    const nativeContent = fs.readFileSync(nativePath, 'utf-8');
    const warnings = [];
    const baseName = relNative.replace(/\.js$/, '');
    const normalizedBaseName = baseName.replace(/\\/g, '/');

    const nativeFallbackName = path.basename(nativePath, '.js');
    const webFallbackName = path.basename(webPath, '.web.js');
    const nativeComponentName = getDefaultExportName(nativeContent, nativeFallbackName);
    const webComponentName = getDefaultExportName(webContent, webFallbackName);

    // 1. Compare hook imports
    const webHooks = extractHookImports(webContent);
    const nativeHooks = extractHookImports(nativeContent);
    const webLocalHooks = extractLocalHookNames(webContent);
    const nativeLocalHooks = extractLocalHookNames(nativeContent);
    const missingInWeb = setDifference(nativeHooks, webHooks);
    const missingInNative = setDifference(webHooks, nativeHooks);

    const fileEquivalents = HOOK_EQUIVALENTS[normalizedBaseName];
    if (fileEquivalents?.webProvidesForNative) {
      Object.entries(fileEquivalents.webProvidesForNative).forEach(([nativeHook, webAlternates]) => {
        if (!missingInWeb.has(nativeHook)) return;
        const satisfied = webAlternates.some((alt) => webHooks.has(alt) || webLocalHooks.has(alt));
        if (satisfied) {
          missingInWeb.delete(nativeHook);
        }
      });
    }
    if (fileEquivalents?.nativeProvidesForWeb) {
      Object.entries(fileEquivalents.nativeProvidesForWeb).forEach(([webHook, nativeAlternates]) => {
        if (!missingInNative.has(webHook)) return;
        const satisfied = nativeAlternates.some((alt) => nativeHooks.has(alt) || nativeLocalHooks.has(alt));
        if (satisfied) {
          missingInNative.delete(webHook);
        }
      });
    }

    if (missingInWeb.size > 0) {
      warnings.push(`  Hook imports missing in web: ${[...missingInWeb].join(', ')}`);
    }
    if (missingInNative.size > 0) {
      warnings.push(`  Hook imports missing in native: ${[...missingInNative].join(', ')}`);
    }

    // 2. Compare component props (only for components, not screens)
    const webProps = extractPropNames(webContent, webComponentName);
    const nativeProps = extractPropNames(nativeContent, nativeComponentName);
    const propsMissingInWeb = setDifference(nativeProps, webProps);
    const propsMissingInNative = setDifference(webProps, nativeProps);

    if (propsMissingInWeb.size > 0) {
      warnings.push(`  Props missing in web: ${[...propsMissingInWeb].join(', ')}`);
    }
    if (propsMissingInNative.size > 0) {
      warnings.push(`  Props missing in native: ${[...propsMissingInNative].join(', ')}`);
    }

    // 3. Compare handler names
    const webHandlers = extractHandlerNames(webContent);
    const nativeHandlers = extractHandlerNames(nativeContent);
    const handlersMissingInWeb = setDifference(nativeHandlers, webHandlers);
    const handlersMissingInNative = setDifference(webHandlers, nativeHandlers);

    if (handlersMissingInWeb.size > 0) {
      warnings.push(`  Handlers missing in web: ${[...handlersMissingInWeb].join(', ')}`);
    }
    if (handlersMissingInNative.size > 0) {
      warnings.push(`  Handlers missing in native: ${[...handlersMissingInNative].join(', ')}`);
    }

    // Report
    if (warnings.length > 0) {
      console.log(`[WARN] ${baseName}`);
      warnings.forEach(w => console.log(w));
      console.log('');
      totalWarnings += warnings.length;
    } else {
      console.log(`  [OK] ${baseName}`);
    }
  }

  console.log(`${'='.repeat(50)}`);
  console.log(`${totalWarnings} warning(s) found across ${pairs.length} file pair(s)`);

  if (totalWarnings > 0) {
    console.log('\nNote: Some differences are intentional (e.g., platform-specific handlers).');
    console.log('Review warnings above to identify unintentional drift.');
  }
}

main();
