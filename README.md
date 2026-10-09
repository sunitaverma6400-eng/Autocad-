# MyCAD

Phone ke liye free 2D CAD. HTML5 Canvas + Capacitor. Internet ya account ki zaroorat nahi.

## APK kaise banaye (GitHub se)
1. Saari files repo me push karo (`.github` folder bhi).
2. **Actions -> Build APK** chalao (push par apne aap chalta hai).
3. Artifacts me **MyCAD-apk** download karo, zip kholo, `app-debug.apk` install karo.

## Touch Draw (naya)
Bottom bar ka **Touch: ON** button isse on/off karta hai.
- Tool chuno, phir screen par **tap = point** lag jaata hai (snap ke saath)
- **Press + drag + chhodo** = jahan dabaya wahan se shuru, jahan chhoda wahan khatam. Line, Rect, Circle, Polygon, Ellipse, Arc, Move, Copy, Mirror, Stretch, Box, Cylinder wagairah sab me chalta hai
- Drag karte waqt crosshair ungli se thoda upar rehta hai aur size (length ya width x height ya radius) saath me likha dikhta hai
- Type karke exact size dena ho to command line me number likho, ya Touch OFF karke crosshair + Point use karo

## Screen kaise chalti hai (Touch OFF mode)
- 1 ungli drag = crosshair relative move. Ek tap = crosshair wahan
- **Point** = point lagao, **Done** = command khatam, **Close** = band karke jodo, **Esc** = cancel
- 2 ungli = pan + pinch zoom
- Tabs: Draw / Modify / Annotate / Select / Snap / Layer / View / File (side me scroll hote hain)
- Modify commands: pehle objects chuno (tap + Point, Window, All), phir Done. Pehle se selected ho to seedha chalta hai
- Window select: left->right = poori andar wali objects, right->left = crossing (chhoone wali bhi)

## Features
**Draw:** Line, Polyline, Rect, Polygon, Circle, Arc, Ellipse, Spline, Point, Donut, Xline, Ray, Leader, Table, Text (multi-line `|` se), Hatch (lines / cross / solid / gradient)
**Modify:** Move, Copy, Rotate, Scale, Mirror, Align, Stretch, Offset, Trim, Extend, Break, Break at point, Join, Lengthen, Fillet, Chamfer, Array, Polar Array, Divide, Measure, Pedit, Explode, Match Properties, Grips, Erase, To layer
**Annotate:** Dim Aligned, H/V, Radius, Diameter, Angle, Continue, Baseline, Dim Edit, Dim Style, Text Edit, Distance, Area, Properties panel (har object ka layer/color/linetype/lineweight aur numbers edit)
**Snap:** End, Mid, Center, Quadrant, Intersect, Perpendicular, Tangent, Nearest, Insert, Node, Grid, Ortho, Polar tracking
**Layers:** color, linetype, lineweight, show/hide, lock, current, Isolate, Layer off, Lock/Unlock, Make current, Unlock all, Show all. LT Scale, Units (decimals + mm/cm/m/in)
**Blocks:** Make Block, Insert Block, Attach DXF (dusri DXF ko block ki tarah lagao)
**Files:** DXF Open / Save, PDF export (Page Setup se paper A4-A0, scale 1:n ya fit, title block, selected objects), Undo / Redo, auto-save

## 3D, Blocks, Constraints, Sheets (naya)
**3D tab:** Extrude (closed polyline / circle ko height do), Box, Cylinder, Cone, Sphere. **3D View** me ghumao (1 ungli), zoom/pan (2 ungli), Iso / Front / Right / Top, Shaded / Edges / Wire. **Export STL** se 3D printing file. DXF me 3DFACE ban kar jaata hai. Boolean (union/subtract) nahi hai
**Blocks tab:** Make Block ab linked insert banata hai. Same naam se dobara Make Block karo to saare inserts update ho jaate hain. Block badalna ho to Explode karo, badlo, same naam se Make Block
- **Attributes:** Define Attribute (tag, prompt, default), insert karte waqt value poochta hai, Edit Attribute, Extract Attributes (CSV)
- **Dynamic block:** Dynamic Grips se insert ko kheench kar width / height / uniform scale / rotate karo. Properties me flip, rows x columns array, aur visibility states (kisi object ki "Visibility tag" me naam likho, phir insert me State chuno)
**Constraints tab:** Horizontal, Vertical, Parallel, Perpendicular, Equal Length, Equal Radius, Coincident, Concentric, Length, Radius, Fix, Remove. Edit ke baad apne aap solve hoti hain. Jo object hilna nahi chahiye use Fix karo
**Sheets tab:** Sheet Set me sheets banao (paper, orientation, title). Layout me **+ Viewport** se rectangle kheencho, har viewport ka alag scale (1:n), Pan, Fit, aur har viewport me alag layers chhupa sakte ho. **Publish All PDF** se saari sheets ek multi-page PDF me

## Dhyan rakhne wali baatein
- 3D me boolean, fillet, revolve, sweep nahi hain. Sirf extrude-type aur primitives
- Block inserts me non-uniform scale par circle/arc ka radius average scale se badalta hai (ellipse nahi banta)
- Constraints sirf lines aur circles/arcs par hain. Ek saath dono taraf ke objects thoda-thoda hilte hain, isliye anchor ke liye Fix use karo. DXF me constraints save nahi hoti
- Layout me model ka sirf 2D top view dikhta hai (3D viewport nahi)
- Block insert copy banata hai (linked nahi). Attach DXF bhi copy hai, live xref nahi
- Layout me ek hi view hai (multiple viewports nahi)
- DXF R12 me save hoti hai. Dimension, hatch, spline, ellipse DXF me line/polyline/text ban kar jaate hain. Solid/gradient hatch ka sirf outline jaata hai. Lineweight DXF me nahi jaata
- DXF Open: Line, Circle, Arc, Polyline, Text, MText, Point, Ellipse(poori), Spline, Insert (blocks) aur Dimension (block se) khulte hain. Hatch aur 3D skip hote hain
- Trim: line / circle / arc / polyline. Extend, Fillet, Chamfer: sirf line
