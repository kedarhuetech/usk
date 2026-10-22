# Marketing Studio — Architecture & Development Source of Truth

## 1. Purpose of This Document

This document is the permanent architecture and implementation reference for:

**Grow Your Business → Marketing Studio / Marketing Tools**

Any AI/Codex working on this feature must read this document before making changes.

The feature must be developed **phase by phase**.

Do not implement future phases early unless explicitly requested.

---

# 2. Core Product Goal

Marketing Studio is a business-focused creative tool inside the existing `vyapar-ui` application.

It should allow a business owner to:

1. Discover relevant marketing templates.
2. Find upcoming festivals/events and related templates.
3. Find business-specific promotional templates.
4. Find product-promotion templates.
5. Open a template in an editor.
6. Customize text, images, logo, business information and other supported elements.
7. Add their own text/images/logo.
8. Move, resize and customize elements.
9. Save their design.
10. Export/download the final creative.
11. Eventually share the creative.

Example:

```text
Upcoming Festival
        ↓
Ganesh Chaturthi
        ↓
Choose Template
        ↓
Template opens in Editor
        ↓
Business logo/name automatically inserted
        ↓
User changes greeting / offer / image
        ↓
Download / Share
```

The goal is NOT to recreate Vyapar.

Vyapar screenshots are only functional references.

The final Marketing Studio must have its own original UI/UX consistent with our existing application.

---

# 3. Existing Project Architecture

Current frontend:

```text
React 19
Vite
React Router DOM
Tailwind CSS v4
React Icons
ESLint
```

Application architecture:

```text
main.jsx
   ↓
App.jsx
   ↓
MainLayout
   ↓
Sidebar + Topbar + Outlet
```

Backend already exists:

```text
server/
   ↓
Node.js
Express
```

Do NOT create a second backend.

Extend the existing backend only when a Marketing Studio phase actually requires backend functionality.

---

# 4. Existing Application Must Be Protected

Marketing Studio development must NOT break or unnecessarily modify:

* Dashboard
* Parties
* Items
* Sales
* Purchase
* Utilities
* Barcode Generator
* existing global Topbar
* existing Sidebar
* Add Sale flow
* Add Purchase flow
* invoice functionality

Google Profile Manager is being developed separately.

Do NOT rebuild or modify Google Profile Manager as part of Marketing Studio work.

Before changing any shared component, inspect where it is currently used.

---

# 5. Original Design Rule

Do NOT copy the exact Vyapar Marketing Tools UI.

Do NOT reproduce:

* exact sidebar design
* exact editor toolbar
* exact tab positions
* exact card positions
* exact colors
* exact spacing
* exact hierarchy
* exact template gallery layout
* exact buttons
* exact editor layout

Use Vyapar screenshots only to understand:

* functionality
* workflows
* editor behavior
* template concepts
* useful business features

Our implementation should look like its own modern business/SaaS product.

---

# 6. High-Level Architecture

```text
                    MARKETING STUDIO
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    Template Gallery    Brand Kit       My Designs
          │
          ↓
      Design Editor
          │
   ┌──────┼──────────────┐
   │      │              │
 Text   Images        Shapes/Media
   │      │
   │      ├── User Uploads
   │      ├── My Media
   │      └── Stock Media APIs
   │
   ↓
Template / Design JSON
          │
     ┌────┴─────┐
     │          │
    Save      Export
     │          │
 Backend/DB   PNG/JPEG
```

Future additions may include:

```text
AI Content
AI Suggestions
Background Removal
Animation
Video
Music
Social Publishing
```

These are NOT initial requirements.

---

# 7. ONE Reusable Editor

There must be ONE reusable design editor.

Do NOT create separate editors for:

* Festivals
* For You
* Business
* Products

All categories must use the same editor engine.

Different template data should determine how the editor behaves.

Concept:

```text
Template
   ↓
Template JSON
   ↓
Reusable Editor
```

---

# 8. Template Types

Marketing Studio must eventually support two main template types.

## Type A — Editable Template

Used when individual parts of the design should be editable.

Example:

```text
Ganesh Chaturthi Template

Background
Ganesh Artwork
Heading
Greeting
Business Logo
Business Name
Phone
Offer
Decorative Shapes
```

These are separate elements.

Example internal representation:

```json
{
  "templateType": "editable",
  "width": 1080,
  "height": 1080,
  "elements": []
}
```

The user can interact with permitted elements independently.

---

## Type B — Flat / Overlay Template

Some creatives may be provided as a finished image.

Example:

```text
Educational Poster
News Poster
Information Poster
Ready-made Marketing Creative
```

The original poster is treated as a locked background.

The user can add new elements over it:

```text
Locked Poster Background

+ Business Logo
+ Custom Text
+ Additional Image
+ Shape/Sticker
```

Example:

```json
{
  "templateType": "flat",
  "background": "template-image-url",
  "elements": []
}
```

The internal content of the flat image is NOT individually editable.

---

# 9. Element States

Canvas elements should support three conceptual states.

## Locked

Cannot accidentally move/edit.

Examples:

* background artwork
* decorative graphics
* flat poster background

## Editable

Part of the original template but user is allowed to customize it.

Examples:

* greeting
* business name
* logo
* offer
* product image

## User Added

Created by the user while editing.

Examples:

* new text
* uploaded image
* additional logo
* shape
* sticker

This distinction should be represented in the design/template data.

---

# 10. Editor Engine

Do NOT build low-level canvas manipulation completely from scratch.

Use a suitable free/open-source canvas/editor library compatible with React.

Preferred direction:

```text
Konva
+
react-konva
```

Final dependency choice should be confirmed before installation.

The canvas engine should handle functionality such as:

* object rendering
* selection
* drag
* resize
* rotate
* transforms
* layering
* canvas export

Our application will build the product/editor UI around that engine.

---

# 11. Editor Responsibilities

Eventually the editor should support:

## Canvas

* selection
* drag
* resize
* rotate
* delete
* duplicate
* layer ordering
* zoom
* undo
* redo

## Text

* add text
* edit text
* font family
* font size
* bold
* italic
* underline if supported
* text color
* alignment
* opacity
* move
* resize
* rotate

## Images

* upload image
* add image
* move
* resize
* rotate
* replace
* opacity
* border
* border width
* border color
* corner radius
* flip
* duplicate
* delete

Later:

* crop
* filters
* background removal

Background removal must NOT be assumed to be free or implemented automatically.

---

# 12. Contextual Editing Controls

Editor controls should depend on the selected element.

Example:

```text
Text Selected
      ↓
Font
Size
Color
Alignment
Bold
Opacity
```

```text
Image Selected
      ↓
Replace
Crop
Border
Opacity
Flip
Delete
```

```text
Shape Selected
      ↓
Fill
Border
Opacity
Size
```

Do not display every editing option at the same time.

The editor should remain clean and understandable for normal business owners.

---

# 13. Uploaded Images

Users should be able to upload:

* business logo
* product photo
* shop photo
* promotional image
* other supported media

Flow:

```text
Upload Image
     ↓
Create Canvas Image Element
     ↓
Place on Canvas
     ↓
Drag Anywhere
     ↓
Resize / Rotate / Customize
```

Uploaded images must behave as editable canvas elements.

---

# 14. Media Sources

Images should NOT require developers to manually import hundreds of files into React.

Marketing Studio can eventually use multiple media sources.

## Source 1 — Our Template Assets

Curated artwork and template assets controlled by our application.

## Source 2 — User Uploads

Logo/product/shop/user images.

## Source 3 — My Media

Previously uploaded reusable business assets.

## Source 4 — Stock Media APIs

Potential providers include:

* Pixabay
* Pexels
* Unsplash

Do not integrate all providers immediately.

Choose one provider first when the Stock Media phase begins.

Stock media APIs provide images/media.

They do NOT automatically provide our complete editable business templates.

---

# 15. Template System

Do NOT build every template as a separate React component.

Avoid:

```text
GaneshTemplate.jsx
DiwaliTemplate.jsx
IndependenceTemplate.jsx
BakeryTemplate.jsx
```

Instead use:

```text
Template Data
      ↓
Generic Template Renderer
      ↓
Reusable Editor
```

Templates should eventually be data-driven.

Example:

```json
{
  "id": "ganesh-01",
  "name": "Ganesh Festival Greeting",
  "category": "festival",
  "eventId": "ganesh-chaturthi",
  "templateType": "editable",
  "width": 1080,
  "height": 1080,
  "thumbnail": "",
  "elements": []
}
```

---

# 16. Template JSON

Editable templates should eventually store individual elements.

Conceptual example:

```json
{
  "id": "festival-001",
  "width": 1080,
  "height": 1080,
  "templateType": "editable",
  "elements": [
    {
      "id": "title",
      "type": "text",
      "text": "Happy Ganesh Chaturthi",
      "x": 150,
      "y": 200,
      "fontSize": 54,
      "editable": true
    },
    {
      "id": "business-logo",
      "type": "image",
      "role": "businessLogo",
      "x": 60,
      "y": 60,
      "editable": true
    }
  ]
}
```

This is a conceptual schema.

Do NOT treat this exact schema as finalized until the editor requirements are implemented and validated.

---

# 17. Brand Kit

Marketing Studio should eventually support reusable business branding.

Potential information:

```text
Business Name
Business Logo
Phone
Address
Website
Brand Colors
```

Brand information should be reusable across templates.

Example:

```text
Template Placeholder
{{businessName}}

        ↓

Kartik Electronics
```

Logo placeholder:

```text
role = businessLogo
```

When a template opens, Brand Kit data can automatically populate supported placeholders.

The user should still be allowed to manually customize supported elements.

---

# 18. Festival / Marketing Calendar

The Festival system must NOT rely only on hardcoded React dates.

Concept:

```text
Marketing Calendar
        ↓
Events
        ↓
Templates associated with Event
```

Potential event information:

```text
id
name
date
eventType
region
tags
```

Example:

```text
12 August
    ↓
International Youth Day
    ↓
Related Templates
```

```text
15 August
    ↓
Independence Day
    ↓
Related Templates
```

---

# 19. External Calendar APIs

External holiday/event APIs may eventually supplement our calendar.

However:

**Public holidays are not the same as marketing occasions.**

Marketing Studio may need:

* Indian festivals
* regional festivals
* awareness days
* international days
* business events
* cultural occasions
* seasonal campaigns

Therefore the final system should allow our own curated marketing events.

Potential architecture:

```text
External Holiday Data
          +
Our Marketing Events
          ↓
Unified Marketing Calendar
```

Do NOT integrate an external calendar API until the Festival Calendar phase.

---

# 20. Event → Template Mapping

Events and templates should eventually be associated.

Concept:

```text
Ganesh Chaturthi
      ↓
Template A
Template B
Template C
```

The frontend should be able to request/display templates relevant to a selected event/date.

Do not hardcode hundreds of date/template conditions inside UI components.

---

# 21. For You

"For You" should eventually be more useful than a random template feed.

Potential inputs:

* business type
* current/upcoming festivals
* previous designs
* product category
* seasonal relevance

Initial version can use curated/static data.

Do NOT implement recommendation AI in the first phase.

---

# 22. Business Templates

Business templates may eventually be categorized by business type.

Example:

```text
Electronics
Bakery
Fashion
Restaurant
Retail
Services
```

Relevant templates can then be shown according to business context.

Do not create unnecessary domain-specific fields in existing modules.

---

# 23. Product Marketing

Marketing Studio may eventually integrate with the existing Items/Product data.

Concept:

```text
Choose Product
      ↓
Product Name
Price
Image
      ↓
Product Promotion Template
      ↓
Customize Offer
      ↓
Export
```

Do NOT modify the existing Items module until this integration phase is explicitly started.

Reuse existing data where possible rather than creating duplicate product systems.

---

# 24. My Media

Eventually users should be able to reuse previously uploaded assets.

Example:

```text
My Media

logo.png
shop.jpg
speaker.jpg
product-1.jpg
```

Users should not need to upload their logo for every design.

---

# 25. Saving Designs

A saved design must eventually preserve editability.

Do NOT save only the final JPG/PNG.

Store design information such as:

```text
templateId
canvas size
elements
positions
text values
styles
image references
brand overrides
```

Concept:

```text
Editor
   ↓
Design JSON
   ↓
Database
```

Opening a saved design should reconstruct the editable canvas.

---

# 26. Export

Initial export targets:

```text
PNG
JPEG
```

Export should generate the final composed canvas.

Later possibilities:

* Web Share
* WhatsApp
* social platforms
* scheduled publishing

Do NOT implement direct social publishing until explicitly requested.

---

# 27. Backend Responsibilities

Existing backend:

```text
server/
Node.js
Express
```

Use this backend when required.

Potential future backend responsibilities:

* template API
* event API
* Brand Kit
* saved designs
* user media
* stock API proxy if needed
* file upload
* asset metadata
* AI API integration

Do NOT add backend endpoints before their corresponding phase.

---

# 28. Database Direction

Database schema is NOT finalized yet.

Potential future concepts:

```text
business_brand

marketing_events

marketing_templates

marketing_designs

media_assets
```

Possibly:

```text
template_event_mapping
```

These are architecture concepts, NOT instructions to create all tables now.

Final schema should be decided after the relevant frontend/editor requirements are understood.

---

# 29. File / Image Storage

Production user-uploaded images should generally not be stored as large blobs directly inside normal database records.

Preferred conceptual architecture:

```text
Image Upload
     ↓
File/Object Storage
     ↓
Asset URL
     ↓
Database Metadata
```

The exact storage provider is NOT selected yet.

Do not introduce a paid storage provider without discussion.

---

# 30. Template Administration — Future

Eventually an Admin Template Builder may be useful.

Goal:

Allow authorized users/designers to create templates without modifying React code.

Concept:

```text
Create Template
      ↓
Choose Canvas Size
      ↓
Add Images/Text/Shapes
      ↓
Mark Brand Placeholders
      ↓
Assign Category/Event
      ↓
Save
      ↓
Publish
```

This should reuse the same underlying editor engine where practical.

This is NOT an initial implementation requirement.

---

# 31. AI Features — Future

AI is an enhancement, not a foundation dependency.

Possible future features:

* greeting generation
* caption generation
* offer text
* business-specific marketing copy
* template suggestions
* campaign suggestions

Example:

```text
Festival = Diwali
Business = Bakery
Offer = 20%

        ↓

Generate Marketing Copy
```

AI-generated image functionality is optional and may involve paid APIs.

Do NOT introduce AI APIs until explicitly requested.

---

# 32. Advanced Features — Future

Do NOT implement these in early phases:

* video editor
* music timeline
* complex animations
* AI image generation
* automatic background removal
* social media scheduling
* direct publishing
* advanced collaboration
* complex version history

These can be evaluated after the core image/post editor works properly.

---

# 33. Responsive Requirements

Marketing Studio must eventually work on:

* Desktop
* Tablet
* Mobile

The desktop editor may have more advanced controls.

Tablet/mobile can use responsive panels/drawers.

Avoid:

* unnecessary horizontal page scrolling
* giant empty spaces
* oversized controls
* extremely large typography
* layouts showing very little useful content

The canvas itself may use controlled zoom/scaling when screen space is limited.

---

# 34. Performance Rules

Avoid loading hundreds of full-resolution templates/images at once.

Eventually use:

* thumbnails
* pagination/infinite loading where appropriate
* lazy loading
* optimized media
* controlled API requests

Do not prematurely optimize before real data exists.

---

# 35. Development Phases

Development must follow controlled phases.

## Phase 0 — Architecture

* understand reference workflow
* define architecture
* maintain this document

STATUS: IN PROGRESS / ARCHITECTURE BEING LOCKED

---

## Phase 1 — Marketing Studio Home

Build original Marketing Studio landing experience.

Potential areas:

* Quick Create
* Upcoming Events/Festivals
* Recommended Templates
* Business Promotions
* Product Promotions
* Recent Designs placeholder

No full editor implementation yet.

STATUS: COMPLETED

Completed implementation includes:

* compact Marketing Studio header
* Quick Create entry points
* Recent Designs placeholder
* data-driven Template Discovery tabs: For You, Festivals, Business, Product
* generic DynamicSectionsRenderer
* generic TemplateSection
* generic TemplateCard
* mock festival/event records separated from presentation
* local mock template records with thumbnail references, category, templateType, editMode, tags and designReference
* search across template title, section metadata, category and tags

Still not implemented in Phase 1:

* editor/canvas
* drag, resize, text editing or image editing
* backend/database APIs
* stock-media APIs
* real festival/calendar integration
* persistence for saved designs

---

## Phase 2 — Template Data Model

Define initial frontend template structure.

Create a small number of test templates.

Do not build database yet unless necessary.

STATUS: COMPLETED

Completed implementation includes:

* reusable frontend template registry at `src/constants/marketingStudio/templateRegistry.js`
* discovery metadata separated at `src/constants/marketingStudio/discoveryData.js`
* editable template support with structured background and individual text, image and shape elements
* flat / overlay template support with locked image background and no editable internal poster elements
* initial element fields for future canvas use: id, type, x, y, width, height, rotation, opacity, locked and editable
* text fields for future editing: text, fontFamily, fontSize, fontWeight, fontStyle, fill, align and role
* image fields for future editing: src, role, position, size, locked, editable and optional border/corner placeholders
* Brand Kit-ready placeholders using `bindTo`, including `brand.businessName`, `brand.phone` and `brand.logo`
* discovery sections now reference `templateIds`, resolved through the template registry instead of duplicating template objects
* simple registry helpers: `getTemplateById(id)` and `resolveTemplates(ids)`

Phase 3 — Canvas Editor Foundation is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 3 — Canvas Editor Foundation

Implement:

* canvas
* element selection
* drag
* resize
* rotate
* delete
* duplicate
* basic layer ordering

STATUS: COMPLETED

Completed implementation includes:

* editor route: `/business-growth/marketing-tools/editor/:templateId`
* reusable editor page at `src/pages/BusinessGrowth/MarketingStudioEditor.jsx`
* Konva/react-konva as the single canvas engine
* template loading from `getTemplateById(templateId)`
* cloned local editor state so registry definitions are not mutated
* rendering for text, image and shape elements
* locked background rendering for flat templates
* editable/unlocked element selection with Transformer handles
* drag, resize and rotate state updates stored as clean element x, y, width, height and rotation values
* basic Back, Reset, Duplicate selected and Delete selected actions
* locked/protected elements cannot be selected for mutation
* responsive workspace scaling while preserving template coordinate dimensions
* local-state-only editing with no save/load/export persistence

Phase 4 — Text Editing is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 4 — Text Editing

Implement:

* add text
* edit text
* font controls
* size
* color
* alignment
* styling
* transform

STATUS: COMPLETED

Completed implementation includes:

* contextual text controls shown only when an editable text element is selected
* text content editing through the editor inspector
* compact safe font-family selection
* font-size numeric editing with sensible bounds
* bold, italic and underline controls
* text color editing with color picker and hex input
* left, center and right alignment controls
* opacity control for selected text elements
* all text edits update local element state and immediately re-render the Konva canvas
* locked/protected text remains non-editable because it cannot be selected for mutation
* Reset restores original text values and styles from the template registry clone

Phase 5 — Image Editing is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 5 — Image Editing

Implement:

* image upload
* add image
* drag
* resize
* rotate
* replace
* border
* opacity
* basic image controls

STATUS: COMPLETED

Completed implementation includes:

* contextual image controls shown only when an editable image element is selected
* local Replace Image using the native file picker for PNG, JPG/JPEG and WebP
* Add Image action that creates a new editable user-added image element in local editor state
* image opacity control
* horizontal and vertical flip controls stored as `flipX` and `flipY`
* selected-image reset for opacity, rotation and flip state without resetting the full design
* aspect-preserving cover rendering for image elements
* uploaded images stored as local object URLs and cleaned up when the editor unmounts
* locked/protected image elements and flat-template backgrounds remain non-editable
* no backend/database/upload storage/persistence work

Phase 6 — Add Elements + Local Media Foundation is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 6 — Add Elements + Local Media Foundation

Implement:

* add heading, subheading and body text presets
* add rectangle, circle and line shapes
* shape inspector controls
* local media upload/session library
* shared image insertion path
* newly added elements use current layer system
* flat templates support user overlays

STATUS: COMPLETED

Completed implementation includes:

* compact editor Create panel for Text, Shapes and Media
* Add Heading, Add Subheading and Add Body Text actions that create editable user-added text elements
* Add Rectangle, Add Circle and Add Line actions that create editable user-added shape elements
* contextual shape inspector controls for fill, stroke color, stroke width and opacity
* local current-session uploaded media list backed by object URLs
* shared image upload/loading path for direct Add Image, media uploads and image replacement
* clicking an uploaded media item adds a new editable image element to the canvas
* newly added text, image and shape elements are inserted into local editor state above existing content and auto-selected
* flat templates keep their locked background protected while accepting user-added text, image and shape overlays
* no backend/database/upload persistence or stock media API work

Phase 7 — Layers + History / Undo-Redo foundation is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 7 — Layers + History / Undo-Redo Foundation

Implement:

* more complete layer controls
* undo/redo history for local editor changes

STATUS: COMPLETED

Completed implementation includes:

* local undo/redo history around editor `design` state snapshots
* history limit of 75 meaningful design states
* tracked mutations for add text/image/shape, delete, duplicate, drag, resize, rotate, text edits, image edits, shape edits, image replacement, reset and layer order changes
* redo branch clearing after new edits
* short merge window for rapid text/slider/color changes so history stays usable
* Undo and Redo header controls with disabled states
* keyboard shortcuts: Ctrl/Cmd+Z for undo, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y for redo
* compact Layers panel inside the editor Create panel
* layers shown in visual stacking order with top-most first
* human-friendly layer names for text, uploaded images, shapes and template background
* locked/protected template elements and flat template backgrounds shown as locked and not selectable/mutable from the layer list
* existing Bring Forward, Send Backward, Bring to Front and Send to Back controls integrated with local history and reflected immediately in the Layers panel
* no grouping, multi-select, visibility toggles, backend/database, save/load persistence or export/share work

Phase 8 — Advanced Image Controls / Crop + Filters + Border is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 8 — Advanced Image Controls / Crop + Filters + Border

Implement:

* image crop foundation
* basic image filters
* image border controls

STATUS: COMPLETED

Completed implementation includes:

* image framing controls on editable image elements only
* Fit and Fill modes stored in the existing image element model
* Fill mode crop positioning with normalized `cropX` and `cropY` values so the element canvas position and size stay unchanged
* Fit mode shows the complete image while preserving aspect ratio
* border radius, border color and border width controls for editable images
* local Konva filter controls for brightness, contrast, saturation, blur and grayscale
* neutral adjustment defaults keep original images visually unchanged
* uploaded/session images and template image placeholders use the same image element system
* image edit changes integrate with Phase 7 undo/redo history using merge keys for slider-style controls
* locked/protected template images and flat template backgrounds remain non-editable
* no original image mutation, backend/database work, stock media API work or export/share work

Phase 9 — Brand Kit / Business Details Foundation is next. Do not add backend/database/API work before its corresponding phase.

---

## Phase 9 — Brand Kit / Business Details Foundation

Implement:

* local business details editing
* brand placeholder population for supported template elements

STATUS: COMPLETED

Completed implementation includes:

* reusable local Brand Kit defaults at `src/constants/marketingStudio/brandKitData.js`
* compact Brand section inside the existing Marketing Studio editor Create panel
* editable local/current-session business name, phone, email, website, address and logo
* editable local/current-session primary, secondary and accent brand colors
* Brand Kit logo uploads use the shared image loading utility but remain dedicated Brand Kit state and are not inserted into the current-session Media gallery
* explicit template metadata bindings using `binding`, for example `brand.businessName`, `brand.phone`, `brand.email`, `brand.website`, `brand.address`, `brand.logo` and compatible `business.*` aliases
* explicit brand color style bindings using `styleBindings`, for example `fill: "brand.primaryColor"`
* live one-way personalization from Brand Kit state into supported bound text, image/logo and style properties
* logo-bound image elements update only their `src`/natural image metadata from Brand Kit while preserving template geometry such as x, y, width, height and rotation
* Brand Kit supports two usage modes: template-defined bound elements in template-controlled positions, and manual Add to Design insertion from the Brand panel
* manual Add to Design creates normal editable/unlocked user-added elements for business name, phone, email, website, address and logo using current Brand Kit values
* manually inserted Brand elements start linked to Brand Kit through the same semantic `binding` field and are inserted above existing content through the normal element/layer path
* no string matching of visible template text for personalization
* manual edits to bound text/image content set a local `brandOverride` flag on that element so future Brand Kit changes do not overwrite the user's manual content
* manual edits to explicitly bound styles set local `styleOverrides` flags for the changed style property only
* bound elements show linked/overridden status in the Inspector, and overridden bound elements expose a compact action to use the current Brand Kit value again
* Reset rebuilds the design from the template registry clone and reapplies the current Brand Kit, clearing local element override flags without mutating the registry
* Undo/Redo history now stores local editor snapshots containing both `design` and `brandKit`
* only a small number of existing editable demo templates were updated to demonstrate bindings
* `business-offer-01` visibly demonstrates bound logo, business name, phone, website, email and address on one editable template
* flat template backgrounds remain protected; Brand Kit can affect flat templates only through separate bound overlay elements, such as the `info-safety-01` logo overlay or manually inserted Brand fields
* no backend/database, authentication, stock API, export/share or persistence work

---

## Phase 10 — Export / Download Foundation

Implement:

* frontend-only PNG/JPEG export
* 1x and 2x output resolution
* JPEG quality control
* share-as-image foundation

STATUS: COMPLETED

Completed implementation includes:

* compact editor header actions for Share and Download
* export panel for PNG/JPEG format, 1x/2x resolution and JPEG quality
* expected output dimensions shown from real template dimensions
* export uses the existing Konva Stage and compensates for visual workspace zoom so 1x matches template size exactly
* 2x export uses doubled template pixel dimensions
* clean export temporarily hides selection/Transformer state and restores selection afterward without creating history entries
* exported output includes only the design canvas: flat background, editable template elements, user-added overlays, Brand Kit fields, layer order, transforms, opacity, crop/fill, filters, flips, borders and radius
* Share uses Web Share API with a generated PNG `File` when supported
* unsupported Share paths show a safe fallback asking the user to download instead
* export/share/download are frontend-only and do not mutate the template registry or create backend/database/persistence work

Phase 11 should continue with broader editable-template coverage and template schema refinement. Do not add backend/database/API work before its corresponding phase.

---

## Phase 11 — Library + Stock Media Foundation + Pexels Provider

Implement:

* reusable media Library panel
* My Uploads
* stock-media provider abstraction
* stock image search UI foundation
* Backgrounds view
* insert/replace/background actions through the existing image pipeline
* one real stock provider connection

STATUS: COMPLETED AS FRONTEND PEXELS INTEGRATION

Completed implementation includes:

* the existing Media rail item was renamed to `Library` while reusing the same internal editor tool/panel architecture
* the Library panel includes `My Uploads`, `Stock Images` and `Backgrounds` tabs
* existing local upload/session media remains the source of truth for uploaded images and appears under `My Uploads`
* uploaded images still use the existing object URL loading and cleanup lifecycle
* stock media is accessed through `src/services/marketingStudio/stockMediaService.js` instead of direct provider-specific JSX calls
* provider results are normalized to `id`, `thumbnailUrl`, `previewUrl`, `fullUrl`, `width`, `height`, `alt`, `author`, `source` and `sourceUrl`
* Pexels, Pixabay and Unsplash are supported live providers inside the same Library > Stock Images UI
* Vite environment configuration is documented in `.env.example` using `VITE_PEXELS_API_KEY`, `VITE_PIXABAY_API_KEY` and `VITE_UNSPLASH_ACCESS_KEY`
* when `VITE_PEXELS_API_KEY` is configured, `stockMediaService.searchImages(query, options)` calls the official Pexels `/v1/search` API and normalizes `photos`
* when `VITE_PIXABAY_API_KEY` is configured, `stockMediaService.searchImages(query, options)` calls the official Pixabay `/api/` image search API and normalizes `hits`
* when `VITE_UNSPLASH_ACCESS_KEY` is configured, `stockMediaService.searchImages(query, options)` calls the official Unsplash `/search/photos` API using `Authorization: Client-ID <access key>` and normalizes `results`
* the Unsplash Secret Key is not used in the frontend stock search flow
* live searches request 24 lightweight result records per page where supported through each provider's page/per-page parameters
* provider responses are normalized to `{ results, page, perPage, totalResults, hasMore, provider }` so future stock providers can use the same pagination contract
* Library owns separate pagination state for Stock Images and Backgrounds, including `page`, `hasMore`, `totalResults`, `provider` and searched query metadata
* first searches replace the result list; `Load More` requests the next provider page and appends results after de-duplicating by normalized provider asset id
* pagination resets when the query changes, when the Library tab changes back to a stock/search tab and when the active provider changes
* result cards continue to render lazy-loaded thumbnail/preview URLs; full-size URLs are only used when an asset is inserted, replaced or used as the background
* normalized stock media preserves provider metadata including `provider`, `providerAssetId`, creator/photographer, source URL, attribution URL and Unsplash download tracking URL when supplied
* when no live provider is configured, the editor remains usable and shows local demo media with a clear non-live provider message
* when the live provider is configured but the request fails, the service surfaces a real error and does not silently fall back to demo media
* stock/local media insertion creates the same normal editable image element model used by uploads
* stock/local media replacement uses the same selected-image replacement path and preserves Phase 8 image editing behavior
* stock/local media can be set as the local design background through the existing `design.background` model without flattening editable elements or mutating the template registry
* stock assets used during the session are registered in the existing session media array and de-duplicated by normalized media id
* no backend/database persistence, upload storage, API proxy, stock marketplace, stickers, QR/barcode, frames, music, video, AI generation or background removal work was added

Implementation walkthrough:

Current multi-provider stock flow:

```text
Library UI
        ->
Stock Images provider selector (Pexels / Pixabay / Unsplash)
        ->
stockMediaService.searchImages(query, { provider, page, perPage })
        ->
Pexels /v1/search OR Pixabay /api/ OR Unsplash /search/photos
        ->
normalized stockMedia object
        ->
existing Add / Replace / Use as Background handlers
        ->
Konva canvas
```

```text
Stock Images / Backgrounds UI
        ↓
searchImages(query, options)
        ↓
src/services/marketingStudio/stockMediaService.js
        ↓
Pexels API /v1/search when VITE_PEXELS_API_KEY exists
        ↓
normalizePexelsPhoto(photo)
        ↓
Library result cards
        ↓
createMediaItemFromStockAsset(asset)
        ↓
existing add / replace / background handlers
        ↓
design.elements or design.background
        ↓
Konva canvas
```

Local uploads and stock images differ only by source metadata after normalization:

* local uploads use object URLs and `source: "upload"`
* Pexels results use provider image URLs and `source: "pexels"`
* both become the same current-session media item shape before reaching the canvas
* both use the same editable image element model and the same insert/replace/background paths

Security / production note:

* This is a frontend-only Vite integration, so `VITE_PEXELS_API_KEY` is exposed to the browser bundle.
* This is acceptable for a frontend foundation/prototype but should not be treated as a production-secure secret-handling architecture.
* Production should move provider requests behind the existing backend/server proxy before relying on provider credentials at scale.

Live provider status:

* Pexels live search is connected in code and becomes active when `VITE_PEXELS_API_KEY` is present.
* Without credentials, the current implementation remains safe and uses local demo fallback records only.

Next phase should continue with broader editable-template coverage and template schema refinement unless intentionally revised. Do not add backend/database/API work before its corresponding phase.

---

## Historical Placeholder — Brand Kit

Brand Kit was implemented earlier in Phase 9. This placeholder remains only as historical planning context and must not be treated as the current next phase.

---

## Phase 12 — Festival Calendar

Status: **Implemented dynamic hybrid event data engine**

Current flow:

```text
MarketingStudioHome
  ↓
eventCalendarService
  ↓
Calendarific India holidays + Wikimedia On This Day + local curated fallback
  ↓
normalized marketing event model
  ↓
Festival Calendar UI + event → template filtering
```

The event model keeps events separate from templates. An event can exist with `templateIds: []`, and template counts are derived from actual template registry event relationships rather than invented numbers.

Current sources:

* Calendarific: `VITE_CALENDARIFIC_API_KEY`, India holiday endpoint for the selected/current year.
* Wikimedia On This Day: selected India-relevant births/jayantis and historical/remembrance probes.
* Local curated fallback: India-specific fixed dates, dynamic festival fallback dates where practical, and business/marketing occasions missing from APIs.

The service normalizes, deduplicates, ranks and session-caches results. Local curated events remain available when external APIs fail or are unavailable.

---

## Phase 13 — Stock Media

Integrate ONE selected stock media provider first.

Do not integrate multiple APIs simultaneously without need.

---

## Phase 14 — Backend / Database

Once actual requirements are proven:

* finalize relevant database schema
* create required APIs
* connect frontend

---

## Phase 15 — Save / Load Designs

Store editable designs and reopen them.

---

## Phase 16 — Export / Share

Implement polished:

* PNG
* JPEG

Then evaluate sharing options.

---

## Phase 17 — Template Admin

Evaluate/build template administration workflow.

---

## Phase 18 — AI Features

Only after core system is stable.

---

## Phase 19 — Advanced Media

Evaluate:

* animation
* video
* music
* advanced image processing

Only if actually required.

---

# 36. Current Development Order

Follow this order unless the architecture is intentionally revised:

```text
Architecture
     ↓
Marketing Studio Home
     ↓
Template Model
     ↓
Canvas Editor
     ↓
Text Editing
     ↓
Image Editing
     ↓
Flat Templates
     ↓
Editable Templates
     ↓
Brand Kit
     ↓
Festival Calendar
     ↓
Stock Media
     ↓
Backend / Database
     ↓
Save / Load
     ↓
Export / Share
     ↓
Template Admin
     ↓
AI
     ↓
Advanced Media
```

---

# 37. Codex / AI Rules

Before making Marketing Studio changes, Codex/AI must:

1. Read this entire document.
2. Inspect relevant existing files.
3. Inspect existing components before creating new ones.
4. Reuse components where appropriate.
5. Preserve existing architecture.
6. Implement ONLY the requested phase/task.
7. Avoid unrelated refactoring.
8. Avoid duplicate components.
9. Do not redesign completed modules.
10. Do not modify Sales/Purchase functionality.
11. Do not modify Google Profile Manager.
12. Keep styling consistent with Tailwind CSS v4 project setup.
13. Maintain responsiveness.
14. Do not install dependencies unless the requested phase requires them.
15. Explain why a new dependency is required before introducing it when not already approved.
16. Do not create backend/database architecture prematurely.
17. Run targeted lint/build after implementation.
18. Report exactly which files were changed.
19. Report what was implemented.
20. Report assumptions or limitations.

---

# 38. No Premature Implementation

Do NOT jump from Marketing Studio Home directly into:

* full backend
* database
* AI
* video
* music
* social publishing
* multiple stock APIs
* complex admin system

Each phase must first be tested and approved.

---

# 39. Architecture Decisions That Must Remain Stable

Unless intentionally revised:

### Decision 1

There is ONE reusable editor.

### Decision 2

Templates are data-driven.

### Decision 3

Both flat and editable templates are supported.

### Decision 4

Elements can be locked, editable or user-added.

### Decision 5

User-uploaded images can become movable/editable canvas elements.

### Decision 6

Brand information can eventually auto-fill template placeholders.

### Decision 7

Festival/event templates should eventually be data-driven rather than hardcoded into UI components.

### Decision 8

Stock APIs provide media, not our complete editable template system.

### Decision 9

Saved designs must preserve editable design data.

### Decision 10

Existing business modules should be reused where appropriate instead of creating duplicate business/product data.

### Decision 11

Marketing Studio must have an original UI rather than copying Vyapar.

### Decision 12

Advanced AI/video/music features come after the core editor.

---

# 40. Current Status

Current focus:

```text
Grow Your Business
        ↓
Marketing Studio
```

Reference Marketing Tools screenshots have been analyzed.

Major functionality identified:

* template discovery
* festival/event discovery
* business templates
* product templates
* flat creatives
* editable creatives
* design editor
* text editing
* image editing
* user uploads
* media library
* business branding
* export/share
* possible video/music functionality

No assumption should be made that every Vyapar feature must be reproduced.

---

# 41. Immediate Next Step

After this architecture document is accepted:

```text
PHASE 1
Marketing Studio Home
```

Before implementation:

1. Inspect the existing `BusinessGrowth` pages/components.
2. Inspect existing Sidebar/Topbar integration.
3. Inspect the current Marketing Tools route/page if one exists.
4. Reuse existing project patterns.
5. Design an ORIGINAL Marketing Studio Home.
6. Do NOT implement the full editor yet.
7. Do NOT add database/backend work yet.

After Phase 1 is implemented and reviewed, move to Phase 2 only after approval.

---

# 42. Final Product Principle

The objective is not:

> Rebuild Vyapar Marketing Tools.

The objective is:

> Understand the business problem solved by Marketing Tools and build our own scalable, polished Marketing Studio for business owners.

Every implementation decision should follow this principle.

# 43. Template Creation Pipeline

Editable templates will eventually be created through a reusable template creation workflow.

Flow:

Admin / Template Creator
→ Create New Template
→ Choose Canvas Size
→ Add images from stock media, uploads, or our assets
→ Add text, shapes, logo placeholders, and other elements
→ Position/resize elements on canvas
→ Mark elements as Locked, Editable, or Brand Placeholder
→ Assign template category
→ Assign festival/event when applicable
→ Save editable design as Template JSON
→ Generate/store template thumbnail
→ Publish template
→ Template becomes available to business users

Important:

- Complete editable templates do NOT automatically come from stock image APIs.
- Stock APIs provide media/assets that can be used while creating templates.
- Templates must not be created as separate React components.
- Published templates must use the same reusable editor engine used by business users.
- A flat template can use a locked poster/image as its base.
- An editable template stores supported elements separately in its design data.
- The Admin Template Builder is a future phase; do not implement it yet.

---

# 44. Current Editor Workspace UI

Status: **Completed Midnight Indigo Creative Studio redesign after Phase 10**

The approved editor remains one reusable React/Konva editor. The final UI pass redesigned the editor into the Ledgerly Midnight Indigo Creative Studio experience without creating a second editor system.

Current workspace structure:

```text
EditorHeader
  - Back, design title, canvas size/type
  - Undo / Redo
  - Share / Download

EditorToolRail
  - Templates
  - Text
  - Media
  - Elements
  - Brand
  - Layers

EditorToolsPanel
  - Contextual panel for the selected rail tool

CanvasStage
  - Stable measured Konva workspace
  - Floating zoom display
  - Selection/Transformer hidden during export

Inspector
  - Contextual selected-element controls
  - Text, image, shape, brand override and layer controls
  - Duplicate/Delete for editable selected elements
  - Reset design action
```

Important decisions:

- The redesigned UI is visual and interaction architecture only; it does not change the template registry, canvas data model, history model or export engine.
- The editor-specific design system uses deep midnight indigo navigation, indigo primary actions, sparse cyan accents, light workspace surfaces, precision borders and compact controls.
- Add Heading, Add Image, Shapes, Brand insertions and Layers live in the contextual left panel instead of crowding the global top bar.
- A contextual object toolbar above the canvas exposes frequent text, image and shape actions while advanced properties remain in the Inspector.
- Duplicate, Delete and selected-element editing remain contextual in the Inspector.
- Share and Download remain top-level output actions.
- Download continues to export only the real design canvas at the selected PNG/JPEG and 1x/2x settings.
- Desktop uses persistent dark tool navigation, animated contextual left panel, canvas workspace and right Inspector.
- Tablet/mobile allow the rail and panels to stack/wrap without horizontal page overflow.
- No backend, persistence, stock API, final marketplace, media API, or new editor engine was introduced by this polish pass.

---

# 45. Production Template Discovery Foundation

Status: **Completed starter production discovery foundation**

The Marketing Studio home now uses a scalable data-driven discovery path:

```text
MarketingStudioHome
  ↓
MarketingDiscovery
  ↓
DynamicSectionsRenderer
  ↓
TemplateSection
  ↓
TemplateCard
  ↓
templateRegistry resolver
  ↓
existing MarketingStudioEditor route
```

The current starter pack intentionally does not include hundreds of templates. It includes a meaningful seed catalog that proves the production architecture:

- 31 unique template definitions in `src/constants/marketingStudio/templateRegistry.js`
- 94 visible section placements across the discovery rows
- 12 reusable discovery sections in `src/constants/marketingStudio/discoveryData.js`
- 31 SVG thumbnail/design preview assets under `public/marketing-studio/templates/`
- 7 local JPG source image assets used by the professional starter template pack

Template definitions are unique records. The same template may appear in multiple tabs, sections, business categories and searches without duplicating the template object.

Current template metadata model:

```text
id
title / name
type
templateType
format
width / height / canvas
thumbnail / thumbnailAlt
businessCategories
discoveryTabs
sections
tags
assets
editableConfig
brandBindings
background
elements
eventId / eventIds
```

Discovery tabs:

- For You
- Festivals
- Business
- Product

Starter sections:

- For You: Recommended for Your Business, Trending Designs, Quick Promotions
- Festivals: Upcoming Festivals, Festival Offers, Greetings
- Business: Business Tips, Customer Reviews, Service Promotions
- Product: New Launch, Sale & Discount, Product Showcase

Business category targeting:

`businessCategoryTargets` in `discoveryData.js` defines category records such as Clothes, Restaurant, Electrical, Services and General. `resolveDiscoveryTemplates` ranks templates using metadata in the registry rather than JSX conditionals. Clothes prioritizes fashion, boutique, wedding, ethnic, retail and offer templates; Restaurant prioritizes food, menu, delivery and cafe templates; Electrical prioritizes service, maintenance, safety and home-service templates.

Search behavior:

Marketing Studio search checks section title, subtitle, filters, template title/name, template type, format, business categories, discovery tabs, section ids and tags.

Flat vs editable behavior:

- Flat templates use a locked thumbnail/poster asset as the canvas background and may include explicit editable brand overlay elements.
- Editable templates continue to use normal Konva-compatible element JSON.
- `fashion-premium-sale-01` is the first production-quality single-template test. It uses a real local fashion image asset, a custom editable element factory, explicit brand bindings and a composed SVG thumbnail preview while still resolving through the same registry/editor path.
- The current professional starter pack contains 7 benchmark templates: fashion sale, restaurant offer, festival greeting, service promotion, product launch, customer review and business discount. These are single registry definitions reused across multiple discovery rows by template ID.
- Both flat and editable templates resolve through the same `getTemplateById` editor route.

How to add a new template later:

1. Add a thumbnail/design preview asset under `public/marketing-studio/templates/`.
2. Add one template record in `templateRegistry.js` with metadata, tags, categories, sections and bindings.
3. Add that template id to any desired `discoverySections` rows.
4. Do not create a new React component for the row or template.
5. A future Template Builder/backend can generate and persist this same metadata shape so manual template-config authoring is no longer required.

Future backend/database migration:

The current constants mirror the intended backend shape. A future API can return the same template metadata and section mappings; the home page should continue rendering via the same reusable discovery components.

---

# 46. Image to Layers (Beta) V1

Status: **Integration boundary implemented; real segmentation requires local Python AI runtime**

Current flow:

```text
MarketingStudioHome
  ->
Image to Layers (Beta) upload/review UI
  ->
POST /api/marketing-studio/image-to-layers
  ->
Existing Node/Express backend
  ->
Python segmentation runner
  ->
Normalized editable image elements
  ->
session design resolver
  ->
Existing MarketingStudioEditor
```

Architecture decisions:

- Node/Express remains the main backend.
- Python is used only as a small image-processing runner for segmentation.
- The feature does not create a second editor, route shell, canvas system or layer model.
- Converted designs are stored as temporary session designs and opened through the existing `/business-growth/marketing-tools/editor/:templateId` route.
- The editor receives the same Konva-compatible schema it already supports:
  - locked background image
  - editable `type: "image"` foreground object elements
  - normal `x`, `y`, `width`, `height`, `rotation`, `opacity`, `locked`, `editable` fields
- Extracted object layers therefore reuse existing selection, drag, resize, rotate, layer ordering, duplicate/delete, undo/redo, Download and Share behavior.

V1 background rule:

- The uploaded flat image is kept as the locked background.
- V1 does not perform generative inpainting or hidden-background reconstruction.
- If a foreground object is moved, the original pixels may still exist in the locked background until a future inpainting phase is implemented.

AI model/runtime decision:

- The Python runner is prepared for `rembg` / U2-Net foreground segmentation.
- If `opencv-python-headless` is available, connected components are used to split the transparent foreground mask into multiple object layers.
- If OpenCV is unavailable but `rembg` works, the salient foreground can still return as one real transparent object layer.
- If the Python AI runtime is missing, the service returns `AI_RUNTIME_UNAVAILABLE` and does not produce mock/fake layers.

Required local runtime for real segmentation:

```text
Python 3.10+
Pillow
numpy
rembg
onnxruntime
opencv-python-headless recommended for multi-object splitting
U2-Net model weights downloaded by rembg on first run
```

Current API contract:

```json
{
  "success": true,
  "width": 1080,
  "height": 1080,
  "background": {
    "type": "image",
    "src": "data:image/...",
    "locked": true,
    "editable": false,
    "reconstruction": "original-image-no-inpainting"
  },
  "layers": [
    {
      "id": "extracted-object-1",
      "type": "image",
      "src": "data:image/png;base64,...",
      "x": 120,
      "y": 160,
      "width": 420,
      "height": 520,
      "editable": true,
      "locked": false
    }
  ]
}
```
