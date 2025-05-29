# RooTasker to Roo+ Rebranding Checklist

## ✅ Completed Changes

1. **Package Information**:
   - ✅ Name changed from "rootasker" to "rooplus"
   - ✅ Display name changed from "RooTasker" to "Roo+"
   - ✅ Publisher changed from "kylehoskins" to "MrMatari"
   - ✅ Repository and homepage URLs updated

2. **Code References**:
   - ✅ API renamed from "RooTaskerAPI" to "RooPlusAPI"
   - ✅ Command prefixes changed from "rootasker" to "rooplus"
   - ✅ VS Code viewContainer and view IDs updated

3. **UI Elements**:
   - ✅ Activity bar icon updated
   - ✅ Logo in README updated
   - ✅ Extension icon updated
   - ✅ Other UI references to the extension name updated

4. **Documentation**:
   - ✅ README.md updated with new branding
   - ✅ Migration guide created for users

## 🔄 In Progress / Still Needed

1. **Storage Path Migration**:
   - ✅ Created migration script for file-based data
   - ✅ Created guide for database-stored information

2. **Visual Assets**:
   - 🔄 Logo files renamed from RooTasker_* to RooPlus_*
   - 🔄 Ensure all icon references in code point to new assets

3. **Extension ID in Marketplace**:
   - 🔄 Change from "kylehoskins.roo-tasker" to "mrmatari.rooplus"

4. **Potential Remaining References**:
   - 🔄 Check for any occurrences of "rootasker" or "RooTasker" in string literals
   - 🔄 Check webview-ui/ directory for any frontend references to "RooTasker"
   - 🔄 Check any help documentation or tooltips

## 🖼️ Image Assets Needed

1. **Required Images**:
   - ✅ main icon.png (already exists)
   - ✅ RooPlus_dark.png (already exists)
   - ✅ RooPlus_lite.png (already exists)
   - ✅ Other functional icons (scheduler-icon.png, etc.) already exist

2. **Marketplace Assets**:
   - 🔄 Banner image for VS Code Marketplace
   - 🔄 Screenshots showing the Roo+ UI for the marketplace listing

## 🧪 Testing Checklist

1. **Visual Verification**:
   - 🔄 Verify all UI elements display the correct "Roo+" branding
   - 🔄 Check activity bar icon and sidebar header
   - 🔄 Verify all menus and commands show the correct name

2. **Functional Testing**:
   - 🔄 Test data migration from RooTasker to Roo+
   - 🔄 Verify all features work with the new branding
   - 🔄 Check API endpoints for correct naming

3. **Documentation Review**:
   - 🔄 Ensure all documentation references the new name
   - 🔄 Update any video tutorials or external references

## 📋 Publishing Checklist

1. **Pre-publish**:
   - 🔄 Update version number appropriately
   - 🔄 Update changelog with rebranding information
   - 🔄 Final review of all rebranding elements

2. **Publish**:
   - 🔄 Publish to VS Code Marketplace under new ID
   - 🔄 Ensure old extension points users to new extension

3. **Post-publish**:
   - 🔄 Announce rebranding to users
   - 🔄 Update any external documentation or websites
   - 🔄 Monitor for any issues related to the rebranding
