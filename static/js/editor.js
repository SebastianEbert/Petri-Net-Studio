        const canvas = document.getElementById('editor');
        const ctx = canvas.getContext('2d');
        const helpTextUI = document.getElementById('help-text');
        const zoomLabel = document.getElementById('zoom-label');
        const modelNameDisplay = document.getElementById('model-name-display');
        const toastUI = document.getElementById('toast');
        const themeToggle = document.getElementById('theme-toggle');
        let width, height;

        // Viewport & State
        let scale = 1, offsetX = 0, offsetY = 0;
        let isPanning = false, panStartX = 0, panStartY = 0;
        let currentTool = 'Select';
        let elements = {}, arcs = [], counter = 1;
        let selectedElement = null, draggingElement = null, resizingPage = null;
        let dragOffsetX = 0, dragOffsetY = 0, selectedForArc = null;
        let linkingReference = null, mouseWorldX = 0, mouseWorldY = 0;

        let modelName = "Untitled_Net", isDirty = false, fileHandle = null;

        // --- Dark Mode Logic ---
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            themeToggle.innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
            redraw();
        });

        function getColors() {
            const isDark = document.body.classList.contains('dark-mode');
            return {
                grid: isDark ? '#334155' : '#cbd5e1',
                line: isDark ? '#94a3b8' : '#334155',
                refLine: isDark ? '#64748b' : '#94a3b8',
                nodeBg: isDark ? '#1e293b' : '#ffffff',
                nodeBorder: isDark ? '#00ff41' : '#1e293b',
                textMain: isDark ? '#ffffff' : '#0f172a',
                textMuted: isDark ? '#cbd5e1' : '#475569',
                pageGrad1: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                pageGrad2: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 0.95)',
                pageTitleBg: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(241, 245, 249, 0.7)',
                pageBorder: isDark ? '#00ff41' : 'rgba(226, 232, 240, 0.8)',
                selected: isDark ? '#00bfff' : '#4f46e5',
                target: '#10b981'
            };
        }

        // --- UI & State Helpers ---
        function showToast(msg, isError = false) {
            toastUI.innerText = msg; toastUI.style.background = isError ? '#ef4444' : '#10b981';
            toastUI.classList.add('show'); setTimeout(() => toastUI.classList.remove('show'), 2500);
        }

        function markDirty() { if (!isDirty) { isDirty = true; renderModelNameUI(); } }
        function markClean() { isDirty = false; renderModelNameUI(); }
        function renderModelNameUI() {
            modelNameDisplay.innerText = modelName + (isDirty ? ' *' : '');
            if (isDirty) modelNameDisplay.classList.add('dirty'); else modelNameDisplay.classList.remove('dirty');
        }

        function updateModelName(newName) {
            if (newName && newName.trim() !== "") { modelName = newName.trim().replace(/\s+/g, '_'); markDirty(); }
        }
        modelNameDisplay.addEventListener('click', () => { updateModelName(prompt("Enter new model name:", modelName)); });

        function resizeCanvas() { width = canvas.parentElement.clientWidth; height = canvas.parentElement.clientHeight; canvas.width = width; canvas.height = height; redraw(); }
        window.addEventListener('resize', resizeCanvas); resizeCanvas();

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
            return { screenX, screenY, worldX: (screenX - offsetX) / scale, worldY: (screenY - offsetY) / scale };
        }

        function setZoom(newScale, screenX = width / 2, screenY = height / 2) {
            newScale = Math.max(0.2, Math.min(newScale, 3));
            const worldXBefore = (screenX - offsetX) / scale;
            const worldYBefore = (screenY - offsetY) / scale;
            scale = newScale; offsetX = screenX - worldXBefore * scale; offsetY = screenY - worldYBefore * scale;
            zoomLabel.innerText = Math.round(scale * 100) + '%'; redraw();
        }

        function clearActiveInput() {
            const activeInput = document.getElementById('inline-editor');
            if (activeInput) activeInput.blur(); // Blur forces save and close
        }

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault(); clearActiveInput();
            const { screenX, screenY } = getMousePos(e);
            setZoom(scale * (e.deltaY > 0 ? 0.9 : 1.1), screenX, screenY);
        }, { passive: false });

        document.getElementById('zoom-in').addEventListener('click', () => { clearActiveInput(); setZoom(scale * 1.2); });
        document.getElementById('zoom-out').addEventListener('click', () => { clearActiveInput(); setZoom(scale * 0.8); });
        document.getElementById('zoom-label').addEventListener('click', () => { clearActiveInput(); scale = 1; offsetX = 0; offsetY = 0; setZoom(1); });

        // --- Recursive Auto Layout ---
        function runAutoLayout(parentId = null, startX = 100, startY = 100) {
            const children = Object.values(elements).filter(e => e.parentId === parentId);
            if (children.length === 0) return { w: 240, h: 180 };

            const cols = Math.ceil(Math.sqrt(children.length));
            let paddingX = 100, paddingY = 100, titleBar = 60;
            let cx = startX + paddingX, cy = startY + (parentId ? titleBar : paddingY);
            let rowMaxH = 0, maxW = 0;

            children.forEach((child, i) => {
                if (i > 0 && i % cols === 0) { cx = startX + paddingX; cy += rowMaxH + paddingY; rowMaxH = 0; }
                if (child.type === 'Page') {
                    const size = runAutoLayout(child.id, cx, cy);
                    child.x = cx; child.y = cy; child.w = size.w; child.h = size.h;
                    cx += size.w + paddingX; rowMaxH = Math.max(rowMaxH, size.h);
                } else {
                    child.x = cx; child.y = cy; cx += 60 + paddingX; rowMaxH = Math.max(rowMaxH, 60);
                }
                maxW = Math.max(maxW, cx - startX);
            });
            let totalH = cy + rowMaxH + paddingY - startY;
            return { w: Math.max(240, maxW), h: Math.max(180, totalH) };
        }

        document.getElementById('btn-autolayout').addEventListener('click', () => {
            if (Object.keys(elements).length === 0) { showToast("Canvas is empty!", true); return; }
            runAutoLayout(null, 100, 100);
            scale = 1; offsetX = 0; offsetY = 0; setZoom(1); markDirty(); redraw(); showToast("Elements organized!");
        });

        // --- PNML Save / Load ---
        function generatePNMLString() {
            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">\n';
            xml += `  <net id="${modelName}" type="http://www.pnml.org/version-2009/grammar/ptnet">\n`;
            xml += `    <name><text>${modelName}</text></name>\n    <page id="root">\n`;

            function serializeNode(id) {
                const el = elements[id]; let out = '';
                if (el.type === 'Page') {
                    out += `      <page id="${el.id}">\n        <name><text>${el.name}</text></name>\n`;
                    out += `        <graphics><position x="${el.x}" y="${el.y}"/><dimension x="${el.w}" y="${el.h}"/></graphics>\n`;
                    for (let cid in elements) { if (elements[cid].parentId === el.id) out += serializeNode(cid); }
                    out += `      </page>\n`;
                } else if (el.type === 'Place') {
                    const tag = el.isRef ? `referencePlace` : `place`;
                    out += `      <${tag} id="${el.id}"${el.isRef ? ` ref="${el.targetId || ''}"` : ''}>\n`;
                    out += `        <name><text>${el.name}</text></name>\n`;
                    if (!el.isRef) out += `        <initialMarking><text>${el.tokens}</text></initialMarking>\n`;
                    out += `        <graphics><position x="${el.x}" y="${el.y}"/></graphics>\n      </${tag}>\n`;
                } else if (el.type === 'Transition') {
                    const tag = el.isRef ? `referenceTransition` : `transition`;
                    out += `      <${tag} id="${el.id}"${el.isRef ? ` ref="${el.targetId || ''}"` : ''}>\n`;
                    if (!el.isRef) {
                        out += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n`;
                        if (el.subType === 'timed') {
                            out += `          <type>timeTransitionType</type>\n`;
                            out += `          <time start="${el.timeStart}" end="${el.timeEnd}"/>\n`;
                        } else { out += `          <type>discreteTransitionType</type>\n`; }
                        out += `        </toolspecific>\n`;
                    }
                    out += `        <name><text>${el.name}</text></name>\n`;
                    out += `        <graphics><position x="${el.x}" y="${el.y}"/></graphics>\n      </${tag}>\n`;
                }
                return out;
            }

            for (let id in elements) { if (!elements[id].parentId) xml += serializeNode(id); }
            arcs.forEach((arc, i) => {
                xml += `      <arc id="a${i}" source="${arc.src}" target="${arc.dst}">\n`;
                if (arc.type === 'inhibitor') xml += `        <toolspecific tool="ModernPetriEditor" version="1.0" type="inhibitor"/>\n`;
                xml += `      </arc>\n`;
            });
            xml += '    </page>\n  </net>\n</pnml>';
            return xml;
        }

        async function handleSave() {
            const xmlData = generatePNMLString();
            if (window.showSaveFilePicker) {
                try {
                    if (!fileHandle) fileHandle = await window.showSaveFilePicker({ suggestedName: modelName + '.pnml', types: [{ description: 'PNML Files', accept: { 'application/xml': ['.pnml', '.xml'] } }] });
                    const writable = await fileHandle.createWritable();
                    await writable.write(xmlData); await writable.close();
                    markClean(); showToast("File overwritten silently!");
                } catch (err) { console.error("Save cancelled:", err); }
            } else {
                const blob = new Blob([xmlData], { type: 'text/xml' }); const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `${modelName}.pnml`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
                markClean(); showToast("Downloaded updated PNML!");
            }
        }

        async function handleOpen() {
            if (window.showOpenFilePicker) {
                try {
                    const [handle] = await window.showOpenFilePicker({ types: [{ description: 'PNML Files', accept: { 'application/xml': ['.pnml', '.xml'] } }] });
                    fileHandle = handle; const file = await handle.getFile(); importPNML(file);
                } catch (err) { console.error("Open cancelled:", err); }
            } else { document.getElementById('file-input').click(); }
        }

        function getChildTag(node, tagName) { for(let i=0; i<node.children.length; i++) { if(node.children[i].tagName.toLowerCase() === tagName.toLowerCase()) return node.children[i]; } return null; }

        function importPNML(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const parser = new DOMParser(); const doc = parser.parseFromString(e.target.result, "application/xml");
                elements = {}; arcs = []; counter = 1; selectedElement = null; linkingReference = null;

                function parseXMLNode(node, parentId) {
                    for (let i = 0; i < node.children.length; i++) {
                        let child = node.children[i], tag = child.tagName.toLowerCase(), id = child.getAttribute('id');
                        if (!id) continue;
                        if (['place', 'transition', 'page', 'referenceplace', 'referencetransition'].includes(tag)) {
                            let name = id, nameNode = getChildTag(child, 'name');
                            if (nameNode) { let textNode = getChildTag(nameNode, 'text'); if (textNode) name = textNode.textContent; }

                            let x = 100, y = 100, w = 240, h = 180, graphicsNode = getChildTag(child, 'graphics');
                            if (graphicsNode) {
                                let posNode = getChildTag(graphicsNode, 'position'); if (posNode) { x = parseFloat(posNode.getAttribute('x')); y = parseFloat(posNode.getAttribute('y')); }
                                let dimNode = getChildTag(graphicsNode, 'dimension'); if (dimNode) { w = parseFloat(dimNode.getAttribute('x')); h = parseFloat(dimNode.getAttribute('y')); }
                            }

                            if (tag === 'page') { elements[id] = { id, name, type: 'Page', x, y, w, h, isRef: false, parentId, tokens: 0 }; parseXMLNode(child, id);
                            } else if (tag === 'place') {
                                let tokens = 0, markNode = getChildTag(child, 'initialMarking');
                                if (markNode) { let textNode = getChildTag(markNode, 'text'); if (textNode) tokens = parseInt(textNode.textContent) || 0; }
                                elements[id] = { id, name, type: 'Place', x, y, isRef: false, parentId, tokens };
                            } else if (tag === 'transition') {
                                let subType = 'discrete', tStart = 0, tEnd = 0;
                                let tsNode = getChildTag(child, 'toolspecific');
                                if (tsNode) {
                                    let typeNode = getChildTag(tsNode, 'type');
                                    if (typeNode && typeNode.textContent.trim() === 'timeTransitionType') {
                                        subType = 'timed';
                                        let timeNode = getChildTag(tsNode, 'time');
                                        if (timeNode) { tStart = parseInt(timeNode.getAttribute('start')) || 0; tEnd = parseInt(timeNode.getAttribute('end')) || 0; }
                                    }
                                }
                                elements[id] = { id, name, type: 'Transition', subType, timeStart: tStart, timeEnd: tEnd, x, y, isRef: false, parentId, tokens: 0 };
                            } else if (tag === 'referenceplace') { elements[id] = { id, name, type: 'Place', x, y, isRef: true, parentId, targetId: child.getAttribute('ref'), tokens: 0 };
                            } else if (tag === 'referencetransition') { elements[id] = { id, name, type: 'Transition', x, y, isRef: true, parentId, targetId: child.getAttribute('ref'), tokens: 0 }; }
                        } else if (tag === 'arc') {
                            let src = child.getAttribute('source'), dst = child.getAttribute('target'), type = 'normal';
                            let tsNode = getChildTag(child, 'toolspecific'); if (tsNode && tsNode.getAttribute('type') === 'inhibitor') type = 'inhibitor';
                            arcs.push({src, dst, type});
                        }
                    }
                }

                const net = doc.querySelector('net');
                if (net) {
                    let nameNode = getChildTag(net, 'name');
                    if (nameNode) { let textNode = getChildTag(nameNode, 'text'); if (textNode) modelName = textNode.textContent; }
                    else { modelName = net.getAttribute('id') || "Imported_Net"; }
                    const rootPage = getChildTag(net, 'page'); if (rootPage) parseXMLNode(rootPage, null);
                }

                let maxNum = 0; for (let id in elements) { let num = parseInt(id.replace(/\D/g, '')); if (!isNaN(num) && num > maxNum) maxNum = num; }
                counter = maxNum + 1; scale = 1; offsetX = 0; offsetY = 0; setZoom(1); markClean(); redraw();
            }; reader.readAsText(file);
        }

        document.getElementById('btn-save').addEventListener('click', handleSave);
        document.getElementById('btn-open').addEventListener('click', handleOpen);
        document.getElementById('file-input').addEventListener('change', (e) => { if (e.target.files.length > 0) { fileHandle = null; importPNML(e.target.files[0]); e.target.value = ''; } });

        window.addEventListener('keydown', function(e) {
            if (document.getElementById('inline-editor')) return;
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
                e.preventDefault(); e.stopPropagation(); handleSave(); return false;
            }
            if ((e.key === 'Backspace' || e.key === 'Delete') && currentTool === 'Select' && selectedElement) {
                e.preventDefault(); deleteElementTree(selectedElement.id); selectedElement = null; markDirty(); redraw(); return false;
            }
        }, { capture: true });

        // --- Interaction Logic ---
        function updateHelp(text) { helpTextUI.innerText = text; }

        function setTool(toolName) {
            currentTool = toolName; selectedForArc = null; if (toolName !== 'Select') selectedElement = null;
            if (linkingReference && toolName !== 'Ref Place' && toolName !== 'Ref Transition') { delete elements[linkingReference.id]; linkingReference = null; markDirty(); }
            document.querySelectorAll('.tool-btn').forEach(b => { if (b.parentElement.id === 'toolbar') { b.classList.remove('active'); if (b.getAttribute('data-tool') === toolName) b.classList.add('active'); }});
            canvas.style.cursor = toolName === 'Select' ? 'default' : 'crosshair'; redraw();
        }

        document.querySelectorAll('#toolbar .tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let currentBtn = e.target;
                // If they clicked the SVG inside the button, grab the parent button
                if (!currentBtn.hasAttribute('data-tool')) currentBtn = currentBtn.closest('.tool-btn');
                if (!currentBtn) return;

                const tool = currentBtn.getAttribute('data-tool');
                if (tool === 'Clear') { elements = {}; arcs = []; counter = 1; selectedElement = null; linkingReference = null; scale = 1; offsetX = 0; offsetY = 0; fileHandle = null; updateModelName("Untitled_Net"); setZoom(1); setTool('Select'); markDirty(); return; }
                setTool(tool);
            });
        });

        function deleteElementTree(id) {
            if (!elements[id]) return;
            if (elements[id].type === 'Page') { for (let cid in elements) { if (elements[cid].parentId === id) deleteElementTree(cid); } }
            for (let rid in elements) { if (elements[rid].isRef && elements[rid].targetId === id) deleteElementTree(rid); }
            arcs = arcs.filter(a => a.src !== id && a.dst !== id); delete elements[id];
        }

        // Derive a valid PNML id from a display name, kept unique across elements.
        function sanitizeId(name) { return name.trim().replace(/\s+/g, '_'); }
        function makeUniqueId(base, ignoreId) {
            if (!base) return ignoreId;
            let id = base, n = 2;
            while (elements[id] && id !== ignoreId) { id = base + '_' + n++; }
            return id;
        }

        // Rename an element AND sync its id to the new name, updating every reference
        // (arcs, reference targets, child parents) so links don't break.
        function renameElement(node, newName) {
            node.name = newName;
            const oldId = node.id, newId = makeUniqueId(sanitizeId(newName), oldId);
            if (newId === oldId) return;
            delete elements[oldId]; node.id = newId; elements[newId] = node;
            for (let cid in elements) {
                if (elements[cid].parentId === oldId) elements[cid].parentId = newId;
                if (elements[cid].targetId === oldId) elements[cid].targetId = newId;
            }
            arcs.forEach(a => { if (a.src === oldId) a.src = newId; if (a.dst === oldId) a.dst = newId; });
        }

        function getDeepestPageAt(wx, wy) {
            let found = null, maxD = -1;
            for (let id in elements) {
                const el = elements[id];
                if (el.type === 'Page' && wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h) { let d = getDepth(el); if (d > maxD) { maxD = d; found = el; } }
            } return found;
        }

        function getDepth(el) { let d = 0; let c = el; while (c.parentId && elements[c.parentId]) { d++; c = elements[c.parentId]; } return d; }

        function getNodeAt(wx, wy) {
            for (let id in elements) { const n = elements[id]; if (n.type !== 'Page' && Math.abs(n.x - wx) < 22 && Math.abs(n.y - wy) < 22) return n; }
            return getDeepestPageAt(wx, wy);
        }

        function getEditableTarget(wx, wy) {
            const sortedIds = Object.keys(elements).sort((a, b) => getDepth(elements[b]) - getDepth(elements[a]));
            for (let id of sortedIds) {
                const n = elements[id];
                if (n.type !== 'Page') {
                    if (Math.abs(n.x - wx) < 22 && Math.abs(n.y - wy) < 22) return { node: n, type: 'name' };
                    if (Math.abs(n.x - wx) < 50 && wy >= n.y - 40 && wy <= n.y - 10) return { node: n, type: 'name' };
                    if (n.subType === 'timed' && Math.abs(n.x - wx) < 50 && wy >= n.y + 20 && wy <= n.y + 45) return { node: n, type: 'timing' };
                } else {
                    if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + 36) return { node: n, type: 'name' };
                }
            }
            return null;
        }

        function getCenter(node) { return node.type === 'Page' ? { x: node.x + node.w/2, y: node.y + node.h/2 } : { x: node.x, y: node.y }; }
        function getPerimeterPoint(node, tx, ty) {
            const c = getCenter(node); const a = Math.atan2(ty - c.y, tx - c.x);
            if (node.type.includes('Place')) return { x: c.x + 20 * Math.cos(a), y: c.y + 20 * Math.sin(a) };
            const hw = node.type === 'Page' ? node.w/2 : 15, hh = node.type === 'Page' ? node.h/2 : 20;
            const acos = Math.abs(Math.cos(a)), asin = Math.abs(Math.sin(a));
            const d = (hw * asin < hh * acos) ? (hw / acos) : (hh / asin);
            return { x: c.x + d * Math.cos(a), y: c.y + d * Math.sin(a) };
        }

        function moveElementTree(el, dx, dy) {
            el.x += dx; el.y += dy;
            for (let id in elements) { if (elements[id].parentId === el.id) moveElementTree(elements[id], dx, dy); }
        }

        canvas.addEventListener('dblclick', (e) => {
            if (linkingReference || currentTool === 'Delete') return;
            const { screenX, screenY, worldX, worldY } = getMousePos(e);
            const target = getEditableTarget(worldX, worldY);

            if (target) {
                clearActiveInput();
                const { node, type: editType } = target;

                let targetWorldY = node.y - 26;
                let textAlign = 'center';
                let inputScreenX = offsetX + node.x * scale;

                if (node.type === 'Page') {
                    targetWorldY = node.y + 18;
                    inputScreenX = offsetX + (node.x + 16) * scale;
                    textAlign = 'left';
                } else if (editType === 'timing') {
                    targetWorldY = node.y + 24;
                }

                const input = document.createElement('input');
                input.id = 'inline-editor';
                input.className = editType === 'timing' ? 'inline-input timing' : 'inline-input';
                input.type = 'text';

                const inputScreenY = offsetY + targetWorldY * scale;

                input.style.left = `${inputScreenX}px`;
                input.style.top = `${inputScreenY}px`;
                input.style.textAlign = textAlign;
                input.style.transform = node.type === 'Page' ? 'translate(0, -50%)' : 'translate(-50%, -50%)';
                input.style.fontSize = `${(editType === 'timing' ? 14 : 12) * scale}px`;
                input.style.width = `${Math.max(60, node.name.length * 8) * scale}px`;

                input.value = editType === 'timing' ? `${node.timeStart}, ${node.timeEnd}` : node.name;

                document.getElementById('canvas-container').appendChild(input);
                input.focus();
                input.select();

                function saveAndClose() {
                    if (!document.getElementById('inline-editor')) return;
                    const val = input.value.trim();
                    if (val !== "") {
                        if (editType === 'timing') {
                            const parts = val.split(',').map(s => parseInt(s.trim()));
                            node.timeStart = isNaN(parts[0]) ? 0 : parts[0];
                            node.timeEnd = isNaN(parts[1]) ? node.timeStart : parts[1];
                        } else {
                            renameElement(node, val);
                        }
                        markDirty(); redraw();
                    }
                    input.remove();
                }

                input.addEventListener('blur', saveAndClose);
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') saveAndClose();
                    else if (ev.key === 'Escape') input.remove();
                });
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            clearActiveInput();
            const { screenX, screenY, worldX, worldY } = getMousePos(e);

            if (e.button === 1) { isPanning = true; panStartX = screenX - offsetX; panStartY = screenY - offsetY; canvas.style.cursor = 'grabbing'; return; }

            if (linkingReference) {
                const node = getNodeAt(worldX, worldY);
                if (node && node.type === linkingReference.type && !node.isRef) { linkingReference.targetId = node.id; markDirty(); }
                else { delete elements[linkingReference.id]; }
                linkingReference = null; setTool('Select'); redraw(); return;
            }

            if (currentTool === 'Delete') { const node = getNodeAt(worldX, worldY); if (node) { deleteElementTree(node.id); markDirty(); redraw(); } return; }

            if (currentTool === 'Select') {
                const node = getNodeAt(worldX, worldY);
                if (!node) { isPanning = true; panStartX = screenX - offsetX; panStartY = screenY - offsetY; canvas.style.cursor = 'grabbing'; selectedElement = null; redraw(); return; }
                if (selectedElement && selectedElement.type === 'Page') {
                    const hX = selectedElement.x + selectedElement.w, hY = selectedElement.y + selectedElement.h;
                    if (Math.abs(worldX - hX) < 15 && Math.abs(worldY - hY) < 15) { resizingPage = selectedElement; return; }
                }
                selectedElement = node; draggingElement = node; dragOffsetX = worldX - node.x; dragOffsetY = worldY - node.y; redraw();
            }
            else if (['Place', 'Ref Place', 'Transition', 'Timed Trans', 'Ref Transition', 'Page'].includes(currentTool)) {
                const isRef = currentTool.startsWith('Ref');
                let baseType = currentTool, subType = 'discrete';

                if (currentTool === 'Transition') { baseType = 'Transition'; }
                else if (currentTool === 'Timed Trans') { baseType = 'Transition'; subType = 'timed'; }
                else if (currentTool === 'Ref Transition') { baseType = 'Transition'; }
                else if (currentTool === 'Ref Place') { baseType = 'Place'; }

                const parent = getDeepestPageAt(worldX, worldY);
                const id = (isRef ? 'R' : '') + baseType[0] + counter++;
                elements[id] = {
                    id, name: id, type: baseType, subType, x: worldX, y: worldY, isRef, tokens: 0,
                    parentId: parent ? parent.id : null, targetId: null,
                    w: baseType === 'Page' ? 240 : null, h: baseType === 'Page' ? 180 : null,
                    timeStart: subType === 'timed' ? 1 : 0, timeEnd: subType === 'timed' ? 1 : 0
                };

                markDirty();
                if (isRef) linkingReference = elements[id]; else setTool('Select');
                redraw();
            }
            else if (currentTool === 'Token') { const n = getNodeAt(worldX, worldY); if (n && n.type === 'Place') { n.tokens++; markDirty(); setTool('Select'); } }
            else if (currentTool === 'Arc' || currentTool === 'Inhibitor') {
                const n = getNodeAt(worldX, worldY);
                if (n) {
                    if (!selectedForArc) {
                        selectedForArc = n;
                    } else if (selectedForArc.id !== n.id) {
                        if ((selectedForArc.type === 'Place' && n.type === 'Place') ||
                            (selectedForArc.type === 'Transition' && n.type === 'Transition')) {
                            showToast(`Invalid: Cannot connect ${selectedForArc.type} to ${n.type}!`, true);
                            selectedForArc = null; setTool('Select');
                        } else {
                            arcs.push({ src: selectedForArc.id, dst: n.id, type: currentTool === 'Inhibitor' ? 'inhibitor' : 'normal' });
                            markDirty(); setTool('Select');
                        }
                    }
                } else { selectedForArc = null; }
                redraw();
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const { screenX, screenY, worldX, worldY } = getMousePos(e); mouseWorldX = worldX; mouseWorldY = worldY;
            if (isPanning) { offsetX = screenX - panStartX; offsetY = screenY - panStartY; redraw(); return; }
            if (linkingReference) redraw();
            else if (resizingPage) { resizingPage.w = Math.max(150, worldX - resizingPage.x); resizingPage.h = Math.max(100, worldY - resizingPage.y); markDirty(); redraw(); }
            else if (draggingElement) {
                let nX = worldX - dragOffsetX, nY = worldY - dragOffsetY;
                if (draggingElement.parentId && elements[draggingElement.parentId]) {
                    const p = elements[draggingElement.parentId], isP = draggingElement.type === 'Page', ew = isP ? draggingElement.w : 0, eh = isP ? draggingElement.h : 0;
                    nX = Math.max(p.x + (isP?10:25), Math.min(nX, p.x + p.w - ew - (isP?10:25))); nY = Math.max(p.y + 40 + (isP?10:25), Math.min(nY, p.y + p.h - eh - (isP?10:25)));
                }
                moveElementTree(draggingElement, nX - draggingElement.x, nY - draggingElement.y); markDirty(); redraw();
            }
        });

        canvas.addEventListener('mouseup', () => { draggingElement = null; resizingPage = null; if (isPanning) { isPanning = false; canvas.style.cursor = currentTool === 'Select' ? 'default' : 'crosshair'; } });

        // --- Render System with Dynamic Colors ---
        function drawGrid(cols) {
            ctx.fillStyle = cols.grid; const sX = -offsetX / scale, sY = -offsetY / scale, eX = (width - offsetX) / scale, eY = (height - offsetY) / scale;
            const fX = Math.floor(sX / 24) * 24, fY = Math.floor(sY / 24) * 24;
            for (let x = fX; x < eX; x += 24) for (let y = fY; y < eY; y += 24) { ctx.beginPath(); ctx.arc(x, y, 1.5 / scale, 0, Math.PI * 2); ctx.fill(); }
        }

        function drawArc(src, dst, type, cols) {
            const st = getPerimeterPoint(src, getCenter(dst).x, getCenter(dst).y), en = getPerimeterPoint(dst, getCenter(src).x, getCenter(src).y), a = Math.atan2(en.y - st.y, en.x - st.x);
            ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.strokeStyle = cols.line; ctx.lineWidth = 1.5;
            if (type === 'inhibitor') {
                ctx.lineTo(en.x - 10 * Math.cos(a), en.y - 10 * Math.sin(a)); ctx.stroke();
                ctx.beginPath(); ctx.arc(en.x - 5 * Math.cos(a), en.y - 5 * Math.sin(a), 5, 0, Math.PI * 2); ctx.fillStyle = cols.nodeBg; ctx.fill(); ctx.stroke();
            } else {
                ctx.lineTo(en.x, en.y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(en.x, en.y); ctx.lineTo(en.x - 12 * Math.cos(a - Math.PI / 8), en.y - 12 * Math.sin(a - Math.PI / 8)); ctx.lineTo(en.x - 12 * Math.cos(a + Math.PI / 8), en.y - 12 * Math.sin(a + Math.PI / 8)); ctx.fillStyle = cols.line; ctx.fill();
            }
        }

        function renderElement(n, cols) {
            ctx.save();
            const isSel = n.id === (selectedElement?.id), isTgt = n.id === (selectedForArc?.id);
            ctx.strokeStyle = isSel ? cols.selected : (isTgt ? cols.target : cols.nodeBorder);
            ctx.lineWidth = isSel || isTgt ? 2.5 : 1.5; if (n.isRef) ctx.setLineDash([6, 6]);

            if (n.type === 'Page') {
                ctx.shadowColor = document.body.classList.contains('dark-mode') ? 'rgba(0,0,0,0.5)' : 'rgba(15, 23, 42, 0.08)';
                ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
                const gr = ctx.createLinearGradient(n.x, n.y, n.x, n.y + n.h); gr.addColorStop(0, cols.pageGrad1); gr.addColorStop(1, cols.pageGrad2);
                ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, n.h, 16); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = isSel ? cols.selected : cols.pageBorder; ctx.stroke();
                ctx.fillStyle = cols.pageTitleBg; ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, 36, [16, 16, 0, 0]); ctx.fill();
                ctx.beginPath(); ctx.moveTo(n.x, n.y + 36); ctx.lineTo(n.x + n.w, n.y + 36); ctx.strokeStyle = cols.pageBorder; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = isSel ? cols.selected : cols.textMain; ctx.font = '600 13px system-ui'; ctx.fillText(n.name, n.x + 16, n.y + 23);
                if (isSel) { ctx.fillStyle = cols.selected; ctx.beginPath(); ctx.arc(n.x + n.w - 2, n.y + n.h - 2, 5 / scale, 0, Math.PI*2); ctx.fill(); }
            } else {
                ctx.fillStyle = cols.nodeBg;
                if (n.type === 'Place') {
                    ctx.beginPath(); ctx.arc(n.x, n.y, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                    if (n.tokens === 1) { ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI*2); ctx.fillStyle = cols.textMain; ctx.fill(); }
                    else if (n.tokens > 1) { ctx.fillStyle = cols.textMain; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.tokens, n.x, n.y); }
                } else if (n.type === 'Transition') {
                    ctx.beginPath(); ctx.roundRect(n.x - 15, n.y - 20, 30, 40, 4); ctx.fill(); ctx.stroke();

                    if (n.subType === 'timed') {
                        ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
                        ctx.strokeStyle = isSel ? cols.selected : cols.nodeBorder; ctx.lineWidth = 1; ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x, n.y - 3);
                        ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + 2, n.y + 2); ctx.stroke();
                    }
                }
                ctx.restore();

                // Name rendered ABOVE
                ctx.fillStyle = isSel ? cols.selected : cols.textMuted;
                ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(n.name, n.x, n.y - 26);

                // Timing rendered BELOW
                if (n.subType === 'timed') {
                    ctx.font = '600 14px monospace'; ctx.textBaseline = 'top';
                    ctx.fillText(`[${n.timeStart}, ${n.timeEnd}]`, n.x, n.y + 24);
                }
            }
            ctx.restore();
        }

        function redraw() {
            const cols = getColors();
            ctx.clearRect(0, 0, width, height); ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); drawGrid(cols);
            const sIds = Object.keys(elements).sort((a, b) => getDepth(elements[a]) - getDepth(elements[b]));
            sIds.forEach(id => { if (elements[id].type === 'Page') renderElement(elements[id], cols); });
            for (let id in elements) { const e = elements[id]; if (e.isRef && e.targetId && elements[e.targetId]) {
                const tg = elements[e.targetId], c = getCenter(tg), a = Math.atan2(c.y - e.y, c.x - e.x);
                ctx.save(); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(c.x, c.y); ctx.strokeStyle = cols.refLine; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(c.x - 10 * Math.cos(a - Math.PI / 6), c.y - 10 * Math.sin(a - Math.PI / 6)); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x - 10 * Math.cos(a + Math.PI / 6), c.y - 10 * Math.sin(a + Math.PI / 6)); ctx.stroke(); ctx.restore();
            }}
            if (linkingReference) { const a = Math.atan2(mouseWorldY - linkingReference.y, mouseWorldX - linkingReference.x); ctx.save(); ctx.beginPath(); ctx.moveTo(linkingReference.x, linkingReference.y); ctx.lineTo(mouseWorldX, mouseWorldY); ctx.strokeStyle = cols.refLine; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.restore(); }
            arcs.forEach(arc => { if (elements[arc.src] && elements[arc.dst]) drawArc(elements[arc.src], elements[arc.dst], arc.type, cols); });
            sIds.forEach(id => { if (elements[id].type !== 'Page') renderElement(elements[id], cols); });
            ctx.restore();
        }
