const esbuild = require("esbuild")
const fs = require("fs")
const path = require("path")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started")
		})
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`)
				console.error(`    ${location.file}:${location.line}:${location.column}:`)
			})
			console.log("[watch] build finished")
		})
	},
}

// Simple function to copy locale files
function copyLocaleFiles() {
	const srcDir = path.join(__dirname, "src", "i18n", "locales")
	const destDir = path.join(__dirname, "dist", "i18n", "locales")
	const outDir = path.join(__dirname, "out", "i18n", "locales")

	// Ensure source directory exists before proceeding
	if (!fs.existsSync(srcDir)) {
		console.warn(`Source locales directory does not exist: ${srcDir}`)
		return // Exit early if source directory doesn't exist
	}

	// Create destination directories
	fs.mkdirSync(destDir, { recursive: true })
	try {
		fs.mkdirSync(outDir, { recursive: true })
	} catch (e) {}

	// Function to copy directory recursively
	function copyDir(src, dest) {
		const entries = fs.readdirSync(src, { withFileTypes: true })

		for (const entry of entries) {
			const srcPath = path.join(src, entry.name)
			const destPath = path.join(dest, entry.name)

			if (entry.isDirectory()) {
				// Create directory and copy contents
				fs.mkdirSync(destPath, { recursive: true })
				copyDir(srcPath, destPath)
			} else {
				// Copy the file
				fs.copyFileSync(srcPath, destPath)
			}
		}
	}

	// Copy files to dist directory
	copyDir(srcDir, destDir)
	console.log("Copied locale files to dist/i18n/locales")

	// Copy to out directory for debugging
	try {
		copyDir(srcDir, outDir)
		console.log("Copied locale files to out/i18n/locales")
	} catch (e) {
		console.warn("Could not copy to out directory:", e.message)
	}
}

// Set up file watcher if in watch mode
function setupLocaleWatcher() {
	if (!watch) return

	const localesDir = path.join(__dirname, "src", "i18n", "locales")

	// Ensure the locales directory exists before setting up watcher
	if (!fs.existsSync(localesDir)) {
		console.warn(`Cannot set up watcher: Source locales directory does not exist: ${localesDir}`)
		return
	}

	console.log(`Setting up watcher for locale files in ${localesDir}`)

	// Use a debounce mechanism
	let debounceTimer = null
	const debouncedCopy = () => {
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			console.log("Locale files changed, copying...")
			copyLocaleFiles()
		}, 300) // Wait 300ms after last change before copying
	}

	// Watch the locales directory
	try {
		fs.watch(localesDir, { recursive: true }, (eventType, filename) => {
			if (filename && filename.endsWith(".json")) {
				console.log(`Locale file ${filename} changed, triggering copy...`)
				debouncedCopy()
			}
		})
		console.log("Watcher for locale files is set up")
	} catch (error) {
		console.error(`Error setting up watcher for ${localesDir}:`, error.message)
	}
}

const copyLocalesFiles = {
	name: "copy-locales-files",
	setup(build) {
		build.onEnd(() => {
			copyLocaleFiles()
		})
	},
}

// REMOVED copyRecorderUiFiles function and copyRecorderUiPlugin

const extensionConfig = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	logLevel: "silent",
	plugins: [
		copyLocalesFiles,
		// copyRecorderUiPlugin, // REMOVED plugin to copy recorder-ui
		/* add to the end of plugins array */
		esbuildProblemMatcherPlugin,
		{
			name: "alias-plugin",
			setup(build) {
				// Alias for pkce-challenge
				build.onResolve({ filter: /^pkce-challenge$/ }, (args) => {
					return { path: require.resolve("pkce-challenge/dist/index.browser.js") }
				});
				// Removed alias for @modelcontextprotocol/sdk as we'll use direct import paths
			},
		},
	],
	entryPoints: ["src/extension.ts"],
	format: "cjs",
	sourcesContent: false,
	platform: "node",
	outfile: "dist/extension.js",
	external: ["vscode"], // @modelcontextprotocol/sdk removed from external to allow bundling via specific path
}

// const mcpServerConfig = { // MCP Server REMOVED
// 	...extensionConfig, 
// 	entryPoints: ["src/mcp-server-main.ts"],
// 	outfile: "dist/mcp-server-main.js",
// }


async function main() {
	const extensionCtx = await esbuild.context(extensionConfig)
	// const mcpServerCtx = await esbuild.context(mcpServerConfig) // MCP Server REMOVED

	if (watch) {
		// Start the esbuild watchers
		await extensionCtx.watch()
		// await mcpServerCtx.watch() // MCP Server REMOVED

		// Copy and watch locale files
		console.log("Copying locale files initially...")
		copyLocaleFiles()
		// console.log("Copying recorder-ui files initially...") // REMOVED
		// copyRecorderUiFiles() // REMOVED Also copy recorder UI files

		// Set up the watcher for locale files
		setupLocaleWatcher()
		// TODO: Could add a watcher for recorder-ui files if needed during watch mode
	} else {
		await extensionCtx.rebuild()
		// await mcpServerCtx.rebuild() // MCP Server REMOVED
		copyLocaleFiles() // Ensure files are copied for production build too
		// copyRecorderUiFiles() // REMOVED Ensure recorder UI files are copied for production build
		
		await extensionCtx.dispose()
		// await mcpServerCtx.dispose() // MCP Server REMOVED
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
