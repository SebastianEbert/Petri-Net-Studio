        const canvas = document.getElementById('editor'); const ctx = canvas.getContext('2d');
        const zoomLabel = document.getElementById('zoom-label'); const modelNameDisplay = document.getElementById('model-name-display');
        const toastUI = document.getElementById('toast'); const themeToggle = document.getElementById('theme-toggle');
        let width, height, scale = 1, offsetX = 0, offsetY = 0, isPanning = false, panStartX = 0, panStartY = 0;
        let currentTool = 'Select', elements = {}, arcs = [], counter = 1;
        let selectedElement = null, draggingElement = null, resizingPage = null, selectedForArc = null;
        let dragOffsetX = 0, dragOffsetY = 0;
        let modelName = "Untitled_Dineros_Net", isDirty = false;

        const mqttFeedUI = document.getElementById('mqtt-feed');
        const feedContent = document.getElementById('feed-content');
        const mqttStatus = document.getElementById('mqtt-status');

        document.getElementById('btn-toggle-feed').addEventListener('click', () => {
            mqttFeedUI.classList.toggle('hidden');
            document.getElementById('btn-toggle-feed').classList.toggle('active');
        });

        function logToFeed(msg, type = 'info') {
            const el = document.createElement('div'); el.className = `feed-entry ${type}`;
            const time = document.createElement('span'); time.className = 'feed-time'; time.innerText = new Date().toLocaleTimeString();
            el.appendChild(time); el.appendChild(document.createTextNode(msg)); feedContent.prepend(el);
        }

        const brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
        const mqttTopic = 'dineros/editor/marking';
        let mqttClient = null;

        try {
            mqttClient = mqtt.connect(brokerUrl);
            mqttClient.on('connect', () => {
                mqttStatus.style.backgroundColor = 'var(--target)'; logToFeed(`Connected to broker: ${brokerUrl}`, 'success');
                mqttClient.subscribe(mqttTopic, (err) => { if (!err) logToFeed(`Listening on topic: ${mqttTopic}`, 'info'); });
            });
            mqttClient.on('message', (topic, message) => {
                try {
                    const payload = JSON.parse(message.toString());
                    if (payload.id && typeof payload.tokens === 'number') {
                        if (elements[payload.id] && elements[payload.id].type === 'Place') {
                            elements[payload.id].tokens = Math.max(0, payload.tokens);
                            logToFeed(`Set tokens for ${payload.id} to ${payload.tokens}`, 'success');
                            markDirty(); redraw();
                        } else { logToFeed(`Place ID ${payload.id} not found in model`, 'error'); }
                    } else { logToFeed(`Invalid JSON structure received`, 'error'); }
                } catch (e) { logToFeed(`Failed to parse MQTT message`, 'error'); }
            });
            mqttClient.on('error', (err) => { mqttStatus.style.backgroundColor = 'var(--danger)'; logToFeed(`MQTT Error: ${err.message}`, 'error'); });
            mqttClient.on('close', () => { mqttStatus.style.backgroundColor = 'var(--danger)'; });
        } catch(e) { logToFeed(`Failed to init MQTT Client`, 'error'); }


        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); themeToggle.innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙'; redraw(); });

        function getColors() {
            const isDark = document.body.classList.contains('dark-mode');
            return {
                grid: isDark ? '#334155' : '#cbd5e1', line: isDark ? '#94a3b8' : '#334155', refLine: isDark ? '#64748b' : '#94a3b8',
                nodeBg: isDark ? '#1e293b' : '#ffffff', nodeBorder: isDark ? '#00ff41' : '#1e293b', textMain: isDark ? '#ffffff' : '#0f172a',
                textMuted: isDark ? '#cbd5e1' : '#475569', selected: isDark ? '#00bfff' : '#4f46e5', target: '#10b981',
                pageGrad1: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)', pageGrad2: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 0.95)',
                pageTitleBg: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(241, 245, 249, 0.7)', pageBorder: isDark ? '#00ff41' : 'rgba(226, 232, 240, 0.8)',
                dineros: {
                    Node: { bg: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(248, 250, 252, 0.9)', border: isDark ? '#64748b' : '#94a3b8' },
                    CBGroup: { bg: isDark ? 'rgba(124, 45, 18, 0.6)' : '#ffedd5', border: '#f97316' },
                    Timer: { bg: isDark ? 'rgba(88, 28, 135, 0.6)' : '#f3e8ff', border: '#a855f7' },
                    Sub: { bg: isDark ? 'rgba(12, 74, 110, 0.6)' : '#e0f2fe', border: '#0ea5e9' },
                    Server: { bg: isDark ? 'rgba(20, 83, 45, 0.6)' : '#dcfce7', border: '#22c55e' },
                    Service: { bg: isDark ? 'rgba(20, 83, 45, 0.4)' : '#dcfce7', border: '#22c55e' },
                    Channel: { bg: isDark ? 'rgba(20, 83, 45, 0.8)' : '#bbf7d0', border: '#16a34a' },
                    Topic: { bg: isDark ? 'rgba(30, 58, 138, 0.8)' : '#bae6fd', border: '#0284c7' }
                }
            };
        }

        function showToast(msg, isErr = false) { toastUI.innerText = msg; toastUI.style.background = isErr ? '#ef4444' : '#10b981'; toastUI.classList.add('show'); setTimeout(() => toastUI.classList.remove('show'), 2500); }
        function markDirty() { if (!isDirty) { isDirty = true; modelNameDisplay.innerText = modelName + ' *'; modelNameDisplay.classList.add('dirty'); } }
        function markClean() { isDirty = false; modelNameDisplay.innerText = modelName; modelNameDisplay.classList.remove('dirty'); }
        modelNameDisplay.addEventListener('click', () => { const nn = prompt("Name:", modelName); if(nn) { modelName = nn.replace(/\s+/g, '_'); markDirty(); } });

        function setTool(toolName) {
            currentTool = toolName; selectedForArc = null; if (toolName !== 'Select' && toolName !== 'Token') selectedElement = null;
            document.querySelectorAll('.tool-btn').forEach(b => { b.classList.remove('active'); if (b.getAttribute('data-tool') === toolName) b.classList.add('active'); });
            canvas.style.cursor = toolName === 'Select' ? 'default' : 'crosshair'; redraw();
        }

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let tool = e.target.getAttribute('data-tool'); if (!tool) tool = e.target.closest('.tool-btn').getAttribute('data-tool');
                if (!tool) return;
                if (tool === 'Clear') { elements = {}; arcs = []; counter = 1; selectedElement = null; setTool('Select'); markDirty(); return; }
                setTool(tool);
            });
        });

        function resizeCanvas() { width = canvas.parentElement.clientWidth; height = canvas.parentElement.clientHeight; canvas.width = width; canvas.height = height; redraw(); }
        window.addEventListener('resize', resizeCanvas); resizeCanvas();

        function getMousePos(e) { const rect = canvas.getBoundingClientRect(); return { worldX: (e.clientX - rect.left - offsetX) / scale, worldY: (e.clientY - rect.top - offsetY) / scale }; }
        function setZoom(ns) { scale = Math.max(0.2, Math.min(ns, 3)); zoomLabel.innerText = Math.round(scale * 100) + '%'; redraw(); }
        function clearActiveInput() { const activeInput = document.getElementById('inline-editor'); if (activeInput) activeInput.blur(); }

        canvas.addEventListener('wheel', (e) => { e.preventDefault(); clearActiveInput(); setZoom(scale * (e.deltaY > 0 ? 0.9 : 1.1), getMousePos(e).worldX, getMousePos(e).worldY); }, { passive: false });
        document.getElementById('zoom-in').addEventListener('click', () => { clearActiveInput(); setZoom(scale * 1.2); });
        document.getElementById('zoom-out').addEventListener('click', () => { clearActiveInput(); setZoom(scale * 0.8); });
        document.getElementById('zoom-label').addEventListener('click', () => { clearActiveInput(); scale = 1; offsetX = 0; offsetY = 0; setZoom(1); });

        function getDepth(el) { let d = 0, c = el; while (c && c.parentId && elements[c.parentId]) { d++; c = elements[c.parentId]; } return d; }
        function hasAncestor(nodeId, targetSubType) { let curr = elements[nodeId]; while (curr) { if (curr.subType === targetSubType) return true; curr = curr.parentId ? elements[curr.parentId] : null; } return false; }
        function getAncestorNodeName(nodeId) { let curr = elements[nodeId]; while (curr) { if (curr.subType === 'Node') return curr.name; curr = curr.parentId ? elements[curr.parentId] : null; } return ''; }

        function getDeepestPageAt(wx, wy) {
            let found = null, maxD = -1;
            for (let id in elements) {
                const el = elements[id];
                if (el.type === 'Page' && wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h) {
                    let d = getDepth(el); if (d > maxD) { maxD = d; found = el; }
                }
            } return found;
        }

        function getNodeAt(wx, wy) {
            for (let id in elements) {
                const n = elements[id];
                if (n.type !== 'Page' && Math.abs(n.x - wx) < 22 && Math.abs(n.y - wy) < 22) return n;
            } return getDeepestPageAt(wx, wy);
        }

        function deleteElementTree(id) {
            if (!elements[id]) return;
            if (elements[id].type === 'Page') { for (let cid in elements) { if (elements[cid].parentId === id) deleteElementTree(cid); } }
            for (let rid in elements) {
                if (elements[rid].isRef && elements[rid].targetId === id) { elements[rid].isRef = false; elements[rid].targetId = null; if (elements[rid].type === 'Port') delete elements[rid]; }
            }
            arcs = arcs.filter(a => a.src !== id && a.dst !== id);
            delete elements[id];
        }

        canvas.addEventListener('mousedown', (e) => {
            clearActiveInput();
            const { worldX, worldY } = getMousePos(e);

            if (e.button === 1) { isPanning = true; panStartX = e.clientX - offsetX; panStartY = e.clientY - offsetY; return; }

            if (currentTool === 'Delete') {
                const node = getNodeAt(worldX, worldY);
                if (node) { deleteElementTree(node.id); markDirty(); setTool('Select'); redraw(); }
                return;
            }

            if (currentTool === 'Token') {
                const node = getNodeAt(worldX, worldY);
                if (node && node.type === 'Place') {
                    if (e.shiftKey) node.tokens = Math.max(0, (node.tokens || 0) - 1);
                    else node.tokens = (node.tokens || 0) + 1;
                    markDirty(); redraw();
                } else { setTool('Select'); }
                return;
            }

            if (currentTool === 'Select') {
                selectedElement = getNodeAt(worldX, worldY);
                if (selectedElement) {
                    if (selectedElement.type === 'Page') {
                        const hX = selectedElement.x + selectedElement.w, hY = selectedElement.y + selectedElement.h;
                        if (Math.abs(worldX - hX) < 15 && Math.abs(worldY - hY) < 15) { resizingPage = selectedElement; return; }
                    }
                    draggingElement = selectedElement; dragOffsetX = worldX - selectedElement.x; dragOffsetY = worldY - selectedElement.y;
                } else { isPanning = true; panStartX = e.clientX - offsetX; panStartY = e.clientY - offsetY; }
                redraw();
            }
            else if (['Place', 'Transition', 'Timed Trans', 'Ref Place', 'Ref Transition', 'Start Place', 'End Place', 'Start Tx', 'End Tx'].includes(currentTool)) {
                const isTimed = currentTool === 'Timed Trans';
                const isRef = currentTool.startsWith('Ref');
                const baseType = currentTool.includes('Trans') || currentTool.includes('Tx') ? 'Transition' : 'Place';
                const parent = getDeepestPageAt(worldX, worldY);

                if (parent && ['Topic', 'Service', 'Channel'].includes(parent.subType)) { showToast(`Cannot place nodes directly inside a Channel!`, true); setTool('Select'); return; }

                const isSpecialNode = ['Start Place', 'End Place', 'Start Tx', 'End Tx'].includes(currentTool);
                if (isSpecialNode && (!parent || !['Timer', 'Sub', 'Server'].includes(parent.subType))) {
                    showToast(`Start/End elements must be placed inside a Timer, Sub, or Server Page!`, true); setTool('Select'); return;
                }

                let subType = isTimed ? 'timed' : 'discrete';
                if (currentTool === 'Start Place') subType = 'placeStart';
                if (currentTool === 'End Place') subType = 'placeEnd';
                if (currentTool === 'Start Tx') subType = 'transitionStart';
                if (currentTool === 'End Tx') subType = 'transitionEnd';

                const id = (isRef ? 'R' : '') + (baseType === 'Transition' ? 'T' : 'P') + counter++;
                let defaultName = id;
                if (currentTool === 'Start Place' || currentTool === 'Start Tx') defaultName += '_Start';
                if (currentTool === 'End Place' || currentTool === 'End Tx') defaultName += '_End';

                elements[id] = { id, name: defaultName, type: baseType, subType: subType, x: worldX, y: worldY, isRef, tokens: 0, timeStart: isTimed?1:0, timeEnd: isTimed?1:0, parentId: parent ? parent.id : null };
                markDirty(); setTool('Select');
            }
            else if (currentTool.endsWith('Page') || currentTool === 'Page') {
                const typeMap = { 'Page': 'Standard', 'NodePage': 'Node', 'CBGroupPage': 'CBGroup', 'TimerPage': 'Timer', 'SubPage': 'Sub', 'ServerPage': 'Server', 'TopicPage': 'Topic', 'ServicePage': 'Service' };
                const subType = typeMap[currentTool];
                const parent = getDeepestPageAt(worldX, worldY);

                if (parent && ['Topic', 'Service', 'Channel'].includes(parent.subType)) { showToast(`Cannot place Pages inside a Channel!`, true); setTool('Select'); return; }
                if (subType === 'CBGroup' && (!parent || !hasAncestor(parent.id, 'Node'))) { showToast(`CB Group must be inside a Node!`, true); setTool('Select'); return; }
                if (['Timer', 'Sub', 'Server'].includes(subType) && (!parent || !hasAncestor(parent.id, 'CBGroup'))) { showToast(`${subType} must be inside a CB Group!`, true); setTool('Select'); return; }

                const id = subType + counter++;
                let nx = worldX, ny = worldY, nw = 300, nh = 200;
                if (parent) {
                    nw = Math.min(nw, parent.w - 20); nh = Math.min(nh, parent.h - 50);
                    nx = Math.max(parent.x + 10, Math.min(nx, parent.x + parent.w - nw - 10));
                    ny = Math.max(parent.y + 40, Math.min(ny, parent.y + parent.h - nh - 10));
                }

                elements[id] = {
                    id, name: id, type: 'Page', subType, x: nx, y: ny, w: nw, h: nh, parentId: parent ? parent.id : null,
                    meta: subType === 'Node' ? { exec: 'Multi', threads: 2 } :
                          subType === 'CBGroup' ? { cbType: 'Exclusive', prio: 1 } :
                          subType === 'Timer' ? { t: 5, prio: 1 } :
                          ['Sub', 'Server'].includes(subType) ? { prio: 2 } :
                          subType === 'Service' ? { capacity: 1 } : null
                };

                if (subType === 'Service') {
                    const reqP = 'Port' + counter++; elements[reqP] = { id: reqP, name: 'server_req', type: 'Port', x: nx + nw - 20, y: ny + 40, parentId: id };
                    const resP = 'Port' + counter++; elements[resP] = { id: resP, name: 'server_res', type: 'Port', x: nx + nw - 20, y: ny + nh - 40, parentId: id };
                }

                markDirty(); setTool('Select');
            }
            else if (currentTool === 'Arc' || currentTool === 'Inhibitor') {
                const n = getNodeAt(worldX, worldY);
                if (n) {
                    if (!selectedForArc) { selectedForArc = n; }
                    else if (selectedForArc.id !== n.id) {
                        let src = selectedForArc, dst = n, valid = true;

                        if (src.type === 'Place' && !src.parentId && ['Topic', 'Service', 'Port'].includes(dst.subType || dst.type)) { showToast("Root places cannot connect to channels!", true); valid = false; }
                        if (dst.type === 'Place' && !dst.parentId && ['Topic', 'Service', 'Port'].includes(src.subType || src.type)) { showToast("Root places cannot connect to channels!", true); valid = false; }

                        if (valid) {
                            if (src.type === 'Place' && dst.type === 'Page' && dst.subType === 'Topic') {
                                let pCount = Object.values(elements).filter(e => e.parentId === dst.id).length;
                                let pId = 'Port' + counter++;
                                elements[pId] = { id: pId, name: 'publisher', type: 'Port', x: dst.x + 20, y: dst.y + 40 + pCount*30, parentId: dst.id, isRef: true, targetId: src.id, limit: 0, refDirection: 'in' };
                                valid = false;
                            }
                            else if (src.type === 'Page' && src.subType === 'Topic' && dst.type === 'Place') {
                                let pCount = Object.values(elements).filter(e => e.parentId === src.id).length;
                                let pId = 'Port' + counter++;
                                elements[pId] = { id: pId, name: 'subscriber', type: 'Port', x: src.x + src.w - 20, y: src.y + 40 + pCount*30, parentId: src.id, isRef: true, targetId: dst.id, limit: 0, refDirection: 'out' };
                                valid = false;
                            }
                            else if (src.type === 'Place' && dst.type === 'Page' && dst.subType === 'Service') {
                                let chCount = Object.values(elements).filter(e => e.parentId === dst.id && e.subType === 'Channel').length;
                                let chId = 'Channel' + counter++;
                                elements[chId] = { id: chId, name: 'Client ' + (chCount+1), type: 'Page', subType: 'Channel', x: dst.x + 10, y: dst.y + 40 + (chCount*70), w: dst.w - 50, h: 60, parentId: dst.id };
                                let reqP = 'Port' + counter++; elements[reqP] = { id: reqP, name: 'request', type: 'Port', x: elements[chId].x + 20, y: elements[chId].y + 30, parentId: chId, isRef: true, targetId: src.id, refDirection: 'in' };
                                let resP = 'Port' + counter++; elements[resP] = { id: resP, name: 'response', type: 'Port', x: elements[chId].x + elements[chId].w - 20, y: elements[chId].y + 30, parentId: chId };
                                valid = false;
                            }
                            else if (src.type === 'Page' && src.subType === 'Service' && dst.type === 'Place') {
                                showToast("To complete a service request, drag an Arc from the Client Channel's Response Port to your Place.", true); valid = false;
                            }
                            else if (src.type === 'Port' && dst.type === 'Place') {
                                src.isRef = true; src.targetId = dst.id; src.refDirection = 'out';
                                if (src.name === 'port' || src.name === src.id) src.name = 'request';
                                valid = false;
                            }
                            else if (src.type === 'Place' && dst.type === 'Port') {
                                dst.isRef = true; dst.targetId = src.id; dst.refDirection = 'in';
                                if (dst.name === 'port' || dst.name === dst.id) dst.name = 'response';
                                valid = false;
                            }
                            else if ((src.type === 'Place' && dst.type === 'Place') || (src.type === 'Transition' && dst.type === 'Transition')) {
                                showToast(`Invalid: Cannot connect ${src.type} to ${dst.type}!`, true); valid = false;
                            }

                            if (valid) arcs.push({ src: src.id, dst: dst.id, type: currentTool === 'Inhibitor' ? 'inhibitor' : 'normal' });
                            markDirty();
                        }
                        selectedForArc = null; setTool('Select');
                    }
                } else { selectedForArc = null; }
                redraw();
            }
        });

        function moveElementTree(el, dx, dy) {
            el.x += dx; el.y += dy;
            for (let id in elements) { if (elements[id].parentId === el.id) moveElementTree(elements[id], dx, dy); }
        }

        canvas.addEventListener('mousemove', (e) => {
            const { worldX, worldY } = getMousePos(e);
            if (isPanning) { offsetX = e.clientX - panStartX; offsetY = e.clientY - panStartY; redraw(); return; }

            if (resizingPage) {
                let newW = Math.max(150, worldX - resizingPage.x), newH = Math.max(100, worldY - resizingPage.y);
                if (resizingPage.parentId && elements[resizingPage.parentId]) {
                    const p = elements[resizingPage.parentId];
                    newW = Math.min(newW, p.x + p.w - resizingPage.x - 10); newH = Math.min(newH, p.y + p.h - resizingPage.y - 10);
                }
                let minW = 150, minH = 100;
                for (let cid in elements) {
                    if (elements[cid].parentId === resizingPage.id) {
                        const child = elements[cid];
                        const cx = child.type === 'Page' ? child.x + child.w : child.x + 20;
                        const cy = child.type === 'Page' ? child.y + child.h : child.y + 20;
                        minW = Math.max(minW, cx - resizingPage.x + 10); minH = Math.max(minH, cy - resizingPage.y + 10);
                    }
                }
                resizingPage.w = Math.max(newW, minW); resizingPage.h = Math.max(newH, minH);
                markDirty(); redraw();
            }
            else if (draggingElement) {
                let nX = worldX - dragOffsetX, nY = worldY - dragOffsetY;
                if (draggingElement.parentId && elements[draggingElement.parentId]) {
                    const p = elements[draggingElement.parentId], isP = draggingElement.type === 'Page', ew = isP ? draggingElement.w : 0, eh = isP ? draggingElement.h : 0;
                    nX = Math.max(p.x + (isP?10:25), Math.min(nX, p.x + p.w - ew - (isP?10:25))); nY = Math.max(p.y + 40 + (isP?10:25), Math.min(nY, p.y + p.h - eh - (isP?10:25)));
                }
                moveElementTree(draggingElement, nX - draggingElement.x, nY - draggingElement.y); markDirty(); redraw();
            }
        });

        canvas.addEventListener('mouseup', () => { draggingElement = null; resizingPage = null; isPanning = false; });

        function getEditableTarget(wx, wy) {
            const dCtx = document.createElement('canvas').getContext('2d');
            const sortedIds = Object.keys(elements).sort((a, b) => getDepth(elements[b]) - getDepth(elements[a]));

            for (let id of sortedIds) {
                const n = elements[id];
                if (n.type !== 'Page') {
                    if (Math.abs(n.x - wx) < 22 && Math.abs(n.y - wy) < 22) {
                        if (n.type === 'Port' && ['publisher', 'subscriber'].includes(n.name)) return { node: n, type: 'portLimit' };
                        return { node: n, type: 'name' };
                    }
                    if (['timed'].includes(n.subType) && Math.abs(n.x - wx) < 50 && wy >= n.y + 20 && wy <= n.y + 45) return { node: n, type: 'timing' };
                } else {
                    if (n.meta && !['Topic', 'Service', 'Channel'].includes(n.subType)) {
                        dCtx.font = 'italic 12px serif';
                        let tagX = n.x + n.w - 10;
                        const tags = [];
                        if (n.meta.prio !== undefined) tags.push({key: 'prio', text: `Priority: ${n.meta.prio}`});
                        if (n.meta.t !== undefined) tags.push({key: 't', text: `T: ${n.meta.t}`});
                        if (n.meta.threads !== undefined) tags.push({key: 'threads', text: `Threads: ${n.meta.threads}`});
                        if (n.meta.exec !== undefined) tags.push({key: 'exec', text: `Executor: ${n.meta.exec}`});
                        if (n.meta.cbType !== undefined) tags.push({key: 'cbType', text: `Type: ${n.meta.cbType}`});
                        if (n.meta.capacity !== undefined) tags.push({key: 'capacity', text: `Capacity: ${n.meta.capacity}`});

                        for (let tag of tags) {
                            const tw = dCtx.measureText(tag.text).width + 16;
                            const rectX = tagX - tw; const rectY = n.y + 8;
                            if (wx >= rectX && wx <= rectX + tw && wy >= rectY && wy <= rectY + 20) {
                                return { node: n, type: 'meta', metaKey: tag.key, rect: {x: rectX, y: rectY, w: tw, h: 20} };
                            }
                            tagX -= (tw + 8);
                        }
                    }
                    if (['Topic', 'Service', 'Channel'].includes(n.subType)) {
                        let textY = n.subType === 'Channel' ? n.y + 50 : n.y + 60;
                        if (wx >= n.x && wx <= n.x + n.w && wy >= textY - 15 && wy <= textY + 15) return { node: n, type: 'name' };
                    } else {
                        if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + 36) return { node: n, type: 'name' };
                    }
                }
            } return null;
        }

        canvas.addEventListener('dblclick', (e) => {
            const { worldX, worldY } = getMousePos(e); const target = getEditableTarget(worldX, worldY);
            if (target) {
                clearActiveInput(); const { node, type: editType, metaKey, rect } = target;

                let targetWorldY = node.y - 26, textAlign = 'center', inputScreenX = offsetX + node.x * scale;
                let inputVal = node.name;

                if (node.type === 'Page' && editType === 'name') {
                    if (['Topic', 'Service', 'Channel'].includes(node.subType)) {
                        targetWorldY = node.subType === 'Channel' ? node.y + 46 : node.y + 56;
                        inputScreenX = offsetX + (node.x + node.w/2) * scale;
                        textAlign = 'center';
                    } else {
                        targetWorldY = node.y + 20;
                        inputScreenX = offsetX + (node.x + 16) * scale;
                        textAlign = 'left';
                    }
                    inputVal = node.name;
                } else if (editType === 'timing') {
                    targetWorldY = node.y + 24; inputVal = `${node.timeStart}, ${node.timeEnd}`;
                } else if (editType === 'portLimit') {
                    targetWorldY = node.y - 26; inputVal = node.limit !== undefined ? node.limit : 0;
                } else if (editType === 'meta') {
                    targetWorldY = rect.y + 10; inputScreenX = offsetX + (rect.x + rect.w / 2) * scale; textAlign = 'center'; inputVal = node.meta[metaKey];
                }

                const input = document.createElement('input'); input.id = 'inline-editor'; input.className = 'inline-input';
                if (editType === 'timing' || editType === 'portLimit') input.classList.add('timing');
                if (editType === 'meta') input.classList.add('meta');

                const inputScreenY = offsetY + targetWorldY * scale;
                input.style.left = `${inputScreenX}px`; input.style.top = `${inputScreenY}px`; input.style.textAlign = textAlign;

                if (node.type === 'Page' && editType === 'name' && !['Topic', 'Service', 'Channel'].includes(node.subType)) {
                    input.style.transform = 'translate(0, -50%)';
                } else {
                    input.style.transform = 'translate(-50%, -50%)';
                }

                input.style.fontSize = `${(editType === 'timing' || editType === 'meta' || editType === 'portLimit' ? 12 : 14) * scale}px`;
                input.style.width = `${Math.max(60, String(inputVal).length * 8) * scale}px`;
                input.value = inputVal;

                document.getElementById('canvas-container').appendChild(input); input.focus(); input.select();

                function saveAndClose() {
                    if (!document.getElementById('inline-editor')) return;
                    const val = input.value.trim();
                    if (val !== "") {
                        if (editType === 'timing') {
                            const parts = val.split(',').map(s => parseInt(s.trim())); node.timeStart = isNaN(parts[0]) ? 0 : parts[0]; node.timeEnd = isNaN(parts[1]) ? node.timeStart : parts[1];
                        } else if (editType === 'meta') {
                            if (['prio', 't', 'threads', 'capacity'].includes(metaKey)) { node.meta[metaKey] = parseInt(val) || 1; }
                            else { node.meta[metaKey] = val; }
                        } else if (editType === 'portLimit') {
                            node.limit = parseInt(val) || 0;
                        } else { node.name = val; }
                        markDirty(); redraw();
                    }
                    input.remove();
                }
                input.addEventListener('blur', saveAndClose); input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveAndClose(); else if (ev.key === 'Escape') input.remove(); });
            }
        });

        function getCenter(node) { return node.type === 'Page' ? { x: node.x + node.w/2, y: node.y + node.h/2 } : { x: node.x, y: node.y }; }

        function getPerimeterPoint(node, tx, ty) {
            const c = getCenter(node); const a = Math.atan2(ty - c.y, tx - c.x);
            if (node.type === 'Place' || node.type === 'Port') return { x: c.x + 20 * Math.cos(a), y: c.y + 20 * Math.sin(a) };
            if (node.type === 'Transition') return { x: c.x + 15 * Math.cos(a), y: c.y + 20 * Math.sin(a) };
            const hw = node.type === 'Page' ? node.w/2 : 15, hh = node.type === 'Page' ? node.h/2 : 20;
            const acos = Math.abs(Math.cos(a)), asin = Math.abs(Math.sin(a));
            const d = (hw * asin < hh * acos) ? (hw / acos) : (hh / asin);
            return { x: c.x + d * Math.cos(a), y: c.y + d * Math.sin(a) };
        }

        function drawGrid(cols) {
            ctx.fillStyle = cols.grid; const sX = -offsetX / scale, sY = -offsetY / scale, eX = (width - offsetX) / scale, eY = (height - offsetY) / scale;
            for (let x = Math.floor(sX / 24) * 24; x < eX; x += 24) for (let y = Math.floor(sY / 24) * 24; y < eY; y += 24) { ctx.beginPath(); ctx.arc(x, y, 1.5 / scale, 0, Math.PI * 2); ctx.fill(); }
        }

        function renderElement(n, cols) {
            ctx.save(); const isSel = n.id === (selectedElement?.id); const isTgt = n.id === (selectedForArc?.id); ctx.lineWidth = isSel || isTgt ? 2.5 : 1.5;
            if (n.type === 'Page') {
                const theme = cols.dineros[n.subType] || {bg: cols.pageGrad1, border: cols.pageBorder};
                ctx.fillStyle = theme.bg; ctx.strokeStyle = isSel ? cols.selected : theme.border;
                ctx.beginPath();
                if (['Topic', 'Service', 'Channel'].includes(n.subType)) ctx.roundRect(n.x, n.y, n.w, n.h, 24);
                else ctx.roundRect(n.x, n.y, n.w, n.h, 8);
                ctx.fill(); ctx.stroke();

                ctx.fillStyle = cols.textMain; ctx.font = ['Topic', 'Service', 'Channel'].includes(n.subType) ? 'italic 14px system-ui' : 'italic 16px serif';
                ctx.textAlign = ['Topic', 'Service', 'Channel'].includes(n.subType) ? 'center' : 'left';
                if (['Topic', 'Service'].includes(n.subType)) { ctx.fillText(`«${n.subType.toLowerCase()}»`, n.x + n.w/2, n.y + 30); ctx.fillText(`\\${n.name}`, n.x + n.w/2, n.y + 60); }
                else if (n.subType === 'Channel') { ctx.fillText(`«client»`, n.x + n.w/2, n.y + 30); ctx.fillText(n.name, n.x + n.w/2, n.y + 50); }
                else { ctx.fillText(n.name, n.x + 12, n.y + 24); }

                if (n.meta && !['Topic', 'Service', 'Channel'].includes(n.subType)) {
                    ctx.font = 'italic 12px serif'; ctx.textAlign = 'right'; let tagX = n.x + n.w - 10;
                    const drawTag = (text) => {
                        const tw = ctx.measureText(text).width + 16;
                        ctx.fillStyle = 'rgba(254, 226, 226, 0.8)'; ctx.strokeStyle = '#ef4444'; ctx.setLineDash([4, 4]);
                        ctx.beginPath(); ctx.roundRect(tagX - tw, n.y + 8, tw, 20, 4); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
                        ctx.fillStyle = '#7f1d1d'; ctx.fillText(text, tagX - 8, n.y + 22); tagX -= (tw + 8);
                    };
                    if (n.meta.prio !== undefined) drawTag(`Priority: ${n.meta.prio}`); if (n.meta.t !== undefined) drawTag(`T: ${n.meta.t}`);
                    if (n.meta.threads !== undefined) drawTag(`Threads: ${n.meta.threads}`); if (n.meta.exec !== undefined) drawTag(`Executor: ${n.meta.exec}`);
                    if (n.meta.cbType !== undefined) drawTag(`Type: ${n.meta.cbType}`);
                    if (n.meta.capacity !== undefined) drawTag(`Capacity: ${n.meta.capacity}`);
                }
                if (isSel) { ctx.fillStyle = cols.selected; ctx.beginPath(); ctx.arc(n.x + n.w - 2, n.y + n.h - 2, 6 / scale, 0, Math.PI * 2); ctx.fill(); }

            } else {
                ctx.fillStyle = cols.nodeBg; ctx.strokeStyle = isSel ? cols.selected : (isTgt ? cols.target : cols.nodeBorder);
                if (n.isRef) ctx.setLineDash([6, 6]);

                if (n.type === 'Place') {
                    ctx.beginPath(); ctx.arc(n.x, n.y, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                    if (n.subType === 'placeStart') {
                        ctx.fillStyle = cols.textMain; ctx.beginPath(); ctx.moveTo(n.x-4, n.y-6); ctx.lineTo(n.x+6, n.y); ctx.lineTo(n.x-4, n.y+6); ctx.fill();
                    } else if (n.subType === 'placeEnd') {
                        ctx.fillStyle = cols.textMain; ctx.fillRect(n.x-4, n.y-4, 8, 8);
                    } else if (n.tokens > 0) {
                        ctx.fillStyle = cols.textMain;
                        if (n.tokens === 1) { ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, Math.PI*2); ctx.fill(); }
                        else { ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.tokens, n.x, n.y + 1); ctx.textBaseline = 'alphabetic'; }
                    }
                }
                else if (n.type === 'Transition') {
                    ctx.beginPath(); ctx.rect(n.x - 12, n.y - 20, 24, 40); ctx.fill(); ctx.stroke();
                    if (n.subType === 'timed') {
                        ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x, n.y - 3); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + 2, n.y + 2); ctx.stroke();
                    } else if (n.subType === 'transitionStart') {
                        ctx.fillStyle = cols.textMain; ctx.beginPath(); ctx.moveTo(n.x-4, n.y-14); ctx.lineTo(n.x+6, n.y-8); ctx.lineTo(n.x-4, n.y-2); ctx.fill();
                    } else if (n.subType === 'transitionEnd') {
                        ctx.fillStyle = cols.textMain; ctx.fillRect(n.x-4, n.y-14, 8, 8);
                    }
                } else if (n.type === 'Port') {
                    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(n.x, n.y, 16, 0, Math.PI*2); ctx.fillStyle = cols.bg; ctx.fill(); ctx.stroke();
                }

                ctx.setLineDash([]); ctx.fillStyle = isSel ? cols.selected : cols.textMain; ctx.font = '12px system-ui'; ctx.textAlign = 'center';

                let dispName = n.name;
                if (n.type === 'Port' && ['publisher', 'subscriber'].includes(n.name)) {
                    dispName += ` [L:${n.limit !== undefined ? n.limit : 0}]`;
                }
                ctx.fillText(dispName, n.x, n.y - 28);

                if (n.subType === 'timed') { ctx.font = '600 12px monospace'; ctx.fillText(`[${n.timeStart}, ${n.timeEnd}]`, n.x, n.y + 35); }
            }
            ctx.restore();
        }

        function redraw() {
            const cols = getColors();
            ctx.clearRect(0, 0, width, height); ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); drawGrid(cols);

            const pages = Object.values(elements).filter(e => e.type === 'Page').sort((a, b) => getDepth(a) - getDepth(b));
            pages.forEach(p => renderElement(p, cols));

            // Draw Reference Lines based on Direction logic
            for (let id in elements) {
                const e = elements[id];
                if (e.isRef && e.targetId && elements[e.targetId]) {
                    const tg = elements[e.targetId];
                    let source = e, dest = tg;

                    if (e.refDirection === 'in') { source = tg; dest = e; }
                    else if (e.refDirection === 'out') { source = e; dest = tg; }
                    else {
                        if (['publisher', 'request', 'server_res'].includes(e.name)) { source = tg; dest = e; }
                        else if (['subscriber', 'response', 'server_req'].includes(e.name)) { source = e; dest = tg; }
                    }

                    const st = getPerimeterPoint(source, getCenter(dest).x, getCenter(dest).y);
                    const en = getPerimeterPoint(dest, getCenter(source).x, getCenter(source).y);
                    const a = Math.atan2(en.y - st.y, en.x - st.x);

                    ctx.save(); ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(en.x, en.y);
                    ctx.strokeStyle = cols.refLine; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke();

                    ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(en.x, en.y);
                    ctx.lineTo(en.x - 12 * Math.cos(a - Math.PI / 8), en.y - 12 * Math.sin(a - Math.PI / 8));
                    ctx.lineTo(en.x - 12 * Math.cos(a + Math.PI / 8), en.y - 12 * Math.sin(a + Math.PI / 8));
                    ctx.fillStyle = cols.refLine; ctx.fill(); ctx.restore();
                }
            }

            arcs.forEach(arc => {
                const s = elements[arc.src], d = elements[arc.dst];
                if(s && d) {
                    let st = getCenter(s), en = getCenter(d);
                    if (d.type !== 'Page') {
                        st = getPerimeterPoint(s, getCenter(d).x, getCenter(d).y);
                        en = getPerimeterPoint(d, getCenter(s).x, getCenter(s).y);
                        const a = Math.atan2(en.y - st.y, en.x - st.x);

                        ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(en.x, en.y);
                        ctx.strokeStyle = cols.line; ctx.lineWidth = 1.5; ctx.stroke();

                        if (arc.type === 'inhibitor') {
                            ctx.beginPath(); ctx.arc(en.x - 5*Math.cos(a), en.y - 5*Math.sin(a), 5, 0, Math.PI*2); ctx.fillStyle = cols.nodeBg; ctx.fill(); ctx.stroke();
                        } else {
                            ctx.beginPath(); ctx.moveTo(en.x, en.y);
                            ctx.lineTo(en.x - 12 * Math.cos(a - Math.PI / 8), en.y - 12 * Math.sin(a - Math.PI / 8));
                            ctx.lineTo(en.x - 12 * Math.cos(a + Math.PI / 8), en.y - 12 * Math.sin(a + Math.PI / 8));
                            ctx.fillStyle = cols.line; ctx.fill();
                        }
                    } else {
                        ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(en.x, en.y);
                        ctx.strokeStyle = cols.line; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
                    }
                }
            });

            const nodes = Object.values(elements).filter(e => e.type !== 'Page').sort((a, b) => getDepth(a) - getDepth(b));
            nodes.forEach(n => renderElement(n, cols));
            ctx.restore();
        }

        function runAutoLayout(parentId = null, startX = 100, startY = 100) {
            const childPages = Object.values(elements).filter(e => e.parentId === parentId && e.type === 'Page');
            const childNodes = Object.values(elements).filter(e => e.parentId === parentId && e.type !== 'Page');

            if (parentId === null) {
                let cx = 100, cy = 100, rowMaxH = 0;
                childPages.forEach(p => {
                    const size = runAutoLayout(p.id, cx, cy);
                    p.x = cx; p.y = cy; p.w = size.w; p.h = size.h;
                    cx += size.w + 40; rowMaxH = Math.max(rowMaxH, size.h);
                    if (cx > 1200) { cx = 100; cy += rowMaxH + 40; rowMaxH = 0; }
                });
                return { w: 0, h: 0 };
            }

            let isChannel = elements[parentId] && elements[parentId].subType === 'Channel';
            let isTopic = elements[parentId] && elements[parentId].subType === 'Topic';
            let isService = elements[parentId] && elements[parentId].subType === 'Service';

            let cx = startX + 20, cy = startY + (isChannel ? 20 : 60);
            let maxW = 260, rowMaxH = 0;

            childPages.forEach(p => {
                const size = runAutoLayout(p.id, cx, cy);
                p.x = cx; p.y = cy; p.w = size.w; p.h = size.h;
                cy += size.h + 20; maxW = Math.max(maxW, size.w + 40);
            });

            let standardNodes = childNodes.filter(n => n.type !== 'Port');
            if (standardNodes.length > 0) {
                let rowX = startX + 40;
                standardNodes.forEach(n => {
                    n.x = rowX; n.y = cy + 40; rowX += 80;
                    if (rowX > startX + maxW - 40) { rowX = startX + 40; cy += 80; }
                    rowMaxH = 80;
                });
                cy += rowMaxH + 20;
            }

            let ports = childNodes.filter(n => n.type === 'Port');
            if (isTopic) {
                let pubs = ports.filter(p => p.name === 'publisher'); let subs = ports.filter(p => p.name === 'subscriber');
                pubs.forEach((p, i) => { p.x = startX + 20; p.y = startY + 50 + i*40; cy = Math.max(cy, p.y + 40); });
                subs.forEach((p, i) => { p.x = startX + maxW - 20; p.y = startY + 50 + i*40; cy = Math.max(cy, p.y + 40); });
            }
            else if (isService) {
                let sReq = ports.find(p => p.name === 'server_req'); let sRes = ports.find(p => p.name === 'server_res');
                if (sReq) { sReq.x = startX + maxW - 20; sReq.y = startY + 50; }
                if (sRes) { sRes.x = startX + maxW - 20; sRes.y = Math.max(startY + 120, cy - 20); }
                maxW += 20;
            }
            else if (isChannel) {
                let cReq = ports.find(p => p.name === 'request'); let cRes = ports.find(p => p.name === 'response');
                if (cReq) { cReq.x = startX + 20; cReq.y = startY + 30; }
                if (cRes) { cRes.x = startX + 180; cRes.y = startY + 30; }
                maxW = 200; cy = startY + 60;
            } else {
                let px = startX + 40; ports.forEach(p => { p.x = px; p.y = cy + 20; px += 40; });
            }

            return { w: maxW, h: Math.max(120, cy - startY) };
        }

        document.getElementById('btn-autolayout').addEventListener('click', () => { runAutoLayout(); scale = 1; offsetX = 0; offsetY = 0; markDirty(); redraw(); showToast("Auto-layout applied."); });

        // -------------------------------------------------------------
        // XSD Accurate DiNeROS XML Parser & Generator
        // -------------------------------------------------------------

        document.getElementById('btn-open').addEventListener('click', () => { document.getElementById('file-input').click(); });
        document.getElementById('file-input').addEventListener('change', (e) => { if (e.target.files.length > 0) { fileHandle = null; importPNML(e.target.files[0]); e.target.value = ''; } });

        function getChildTag(node, tagName) { for(let i=0; i<node.children.length; i++) { if(node.children[i].tagName.toLowerCase() === tagName.toLowerCase()) return node.children[i]; } return null; }

        function importPNML(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const parser = new DOMParser(); const doc = parser.parseFromString(e.target.result, "application/xml");
                elements = {}; arcs = []; counter = 1; selectedElement = null;
                let hasPageGraphics = false;

                const net = doc.querySelector('net');
                if (net) {
                    let nameNode = getChildTag(net, 'name');
                    if (nameNode) { let textNode = getChildTag(nameNode, 'text'); if (textNode) modelName = textNode.textContent; }
                    else { modelName = net.getAttribute('id') || "Imported_Net"; }

                    const cbGroups = {};
                    const tspec = getChildTag(net, 'toolspecific');
                    if (tspec) {
                        const cbgs = getChildTag(tspec, 'callbackgroups');
                        if (cbgs) {
                            for(let i=0; i<cbgs.children.length; i++) {
                                let g = cbgs.children[i]; let gid = getChildTag(g, 'id')?.textContent;
                                let gx = 100, gy = 100, gw = 300, gh = 200, pNode = getChildTag(g, 'node')?.textContent || null;
                                let graphicsNode = getChildTag(g, 'graphics');
                                if (graphicsNode) {
                                    let posNode = getChildTag(graphicsNode, 'position'); if (posNode) { gx = parseFloat(posNode.getAttribute('x'))||gx; gy = parseFloat(posNode.getAttribute('y'))||gy; }
                                    let dimNode = getChildTag(graphicsNode, 'dimension'); if (dimNode) { gw = parseFloat(dimNode.getAttribute('x'))||gw; gh = parseFloat(dimNode.getAttribute('y'))||gh; hasPageGraphics = true; }
                                }

                                cbGroups[gid] = { type: getChildTag(g, 'type')?.textContent || 'exclusive', prio: parseInt(getChildTag(g, 'priority')?.textContent || '1') };
                                let internalId = 'CBGroup_' + gid;
                                elements[internalId] = { id: internalId, name: gid, type: 'Page', subType: 'CBGroup', x: gx, y: gy, w: gw, h: gh, parentId: pNode, meta: { cbType: cbGroups[gid].type, prio: cbGroups[gid].prio } };
                            }
                        }
                    }

                    function parseXMLNode(node, parentId) {
                        for (let i = 0; i < node.children.length; i++) {
                            let child = node.children[i], tag = child.tagName.toLowerCase(), id = child.getAttribute('id');
                            if (!id) continue;

                            let name = id, nameNode = getChildTag(child, 'name');
                            if (nameNode) { let textNode = getChildTag(nameNode, 'text'); if (textNode) name = textNode.textContent; }

                            let x = 100, y = 100, w = 300, h = 200;
                            let graphicsNode = getChildTag(child, 'graphics');
                            if (graphicsNode) {
                                let posNode = getChildTag(graphicsNode, 'position'); if (posNode) { x = parseFloat(posNode.getAttribute('x'))||x; y = parseFloat(posNode.getAttribute('y'))||y; }
                                let dimNode = getChildTag(graphicsNode, 'dimension'); if (dimNode) { w = parseFloat(dimNode.getAttribute('x'))||w; h = parseFloat(dimNode.getAttribute('y'))||h; if (tag === 'nodepage' || tag === 'page') hasPageGraphics = true;}
                            }

                            if (tag === 'nodepage' || tag === 'page') {
                                let subType = 'Standard', meta = null;
                                let tsn = getChildTag(child, 'toolspecific');
                                if (tsn) {
                                    let t = getChildTag(tsn, 'type')?.textContent;
                                    if (t === 'nodePage' || tag === 'nodepage') { subType = 'Node'; meta = { exec: getChildTag(tsn, 'executor')?.textContent || 'multi', threads: parseInt(getChildTag(tsn, 'threads')?.textContent || '1') }; }
                                    else if (t === 'callbackTimer') { subType = 'Timer'; meta = { t: parseInt(getChildTag(tsn, 'timer')?.textContent || '5'), prio: parseInt(getChildTag(tsn, 'priority')?.textContent || '1') }; }
                                    else if (t === 'callbackSubscriber') { subType = 'Sub'; meta = { prio: parseInt(getChildTag(tsn, 'priority')?.textContent || '1') }; }
                                    else if (t === 'callbackServer') { subType = 'Server'; meta = { prio: parseInt(getChildTag(tsn, 'priority')?.textContent || '1') }; }

                                    let gName = getChildTag(tsn, 'group')?.textContent;
                                    if (gName && cbGroups[gName]) {
                                        let gId = 'CBGroup_' + gName;
                                        if (elements[gId] && !elements[gId].parentId && parentId) { elements[gId].parentId = parentId; }
                                        parentId = gId;
                                    }
                                }
                                elements[id] = { id, name, type: 'Page', subType, x, y, w, h, parentId, meta };
                                parseXMLNode(child, id);
                            } else if (tag === 'place' || tag === 'referenceplace') {
                                let isRef = tag === 'referenceplace';
                                let subType = 'discrete';
                                let tsn = getChildTag(child, 'toolspecific');
                                if (tsn) {
                                    let tType = getChildTag(tsn, 'type')?.textContent;
                                    if (tType === 'placeStartType') subType = 'placeStart';
                                    else if (tType === 'placeEndType') subType = 'placeEnd';
                                }

                                let tokens = 0;
                                let initMarking = getChildTag(child, 'initialMarking');
                                if (initMarking) {
                                    let tNode = getChildTag(initMarking, 'text');
                                    if (tNode) tokens = parseInt(tNode.textContent) || 0;
                                }

                                elements[id] = { id, name, type: 'Place', subType, x, y, parentId, isRef, targetId: child.getAttribute('ref'), tokens };
                            } else if (tag === 'transition') {
                                let tsn = getChildTag(child, 'toolspecific'); let tType = tsn ? getChildTag(tsn, 'type')?.textContent : null;

                                if (tType === 'topicTransitionType') {
                                    elements[id] = { id, name: getChildTag(tsn, 'topicName')?.textContent || name, type: 'Page', subType: 'Topic', x, y, w, h, parentId };
                                    let pubs = getChildTag(tsn, 'publishers');
                                    if (pubs) {
                                        Array.from(pubs.children).forEach((pub, idx) => {
                                            let pubId = getChildTag(pub, 'id')?.textContent;
                                            let pubLimit = parseInt(getChildTag(pub, 'limit')?.textContent || '0');
                                            if (pubId) { let pPort = 'Port_pub_' + id + '_' + idx; elements[pPort] = { id: pPort, name: 'publisher', type: 'Port', x: x + 20, y: y + 40 + idx*30, parentId: id, isRef: true, targetId: pubId, limit: pubLimit, refDirection: 'in' }; }
                                        });
                                    }
                                    let subs = getChildTag(tsn, 'subscribers');
                                    if (subs) {
                                        Array.from(subs.children).forEach((sub, idx) => {
                                            let subId = getChildTag(sub, 'id')?.textContent;
                                            let subLimit = parseInt(getChildTag(sub, 'limit')?.textContent || '0');
                                            if (subId) { let sPort = 'Port_sub_' + id + '_' + idx; elements[sPort] = { id: sPort, name: 'subscriber', type: 'Port', x: x + w - 20, y: y + 40 + idx*30, parentId: id, isRef: true, targetId: subId, limit: subLimit, refDirection: 'out' }; }
                                        });
                                    }
                                } else if (tType === 'serviceTransitionType') {
                                    let sCap = parseInt(getChildTag(tsn, 'serverCapacity')?.textContent || '1');
                                    elements[id] = { id, name: getChildTag(tsn, 'serviceName')?.textContent || name, type: 'Page', subType: 'Service', x, y, w, h, parentId, meta: {capacity: sCap} };
                                    let sIn = getChildTag(tsn, 'serverInput')?.textContent; let sOut = getChildTag(tsn, 'serverOutput')?.textContent;
                                    let reqP = 'Port_req_' + id; elements[reqP] = { id: reqP, name: 'server_req', type: 'Port', x: x + w - 20, y: y + 40, parentId: id, isRef: true, targetId: sIn, refDirection: 'out' };
                                    let resP = 'Port_res_' + id; elements[resP] = { id: resP, name: 'server_res', type: 'Port', x: x + w - 20, y: y + h - 40, parentId: id, isRef: true, targetId: sOut, refDirection: 'in' };

                                    let channels = getChildTag(tsn, 'channels');
                                    if (channels) {
                                        Array.from(channels.children).forEach((ch, idx) => {
                                            let cid = getChildTag(ch, 'cid')?.textContent || ('ch' + idx); let creq = getChildTag(ch, 'request')?.textContent; let cres = getChildTag(ch, 'response')?.textContent;
                                            elements[cid] = { id: cid, name: 'Client ' + (idx+1), type: 'Page', subType: 'Channel', x: x + 10, y: y + 40 + (idx*70), w: w - 50, h: 60, parentId: id };
                                            let chReqP = 'Port_creq_' + cid; elements[chReqP] = { id: chReqP, name: 'request', type: 'Port', x: elements[cid].x + 20, y: elements[cid].y + 30, parentId: cid, isRef: true, targetId: creq, refDirection: 'in' };
                                            let chResP = 'Port_cres_' + cid; elements[chResP] = { id: chResP, name: 'response', type: 'Port', x: elements[cid].x + elements[cid].w - 20, y: elements[cid].y + 30, parentId: cid, isRef: true, targetId: cres, refDirection: 'out' };
                                        });
                                    }
                                } else {
                                    let isTimed = false;
                                    let subType = 'discrete';
                                    if (tType === 'timeTransitionType') { isTimed = true; subType = 'timed'; }
                                    else if (tType === 'transitionStartType') { isTimed = false; subType = 'transitionStart'; }
                                    else if (tType === 'transitionEndType') { isTimed = false; subType = 'transitionEnd'; }

                                    let tStart = 0, tEnd = 0;
                                    if (isTimed) {
                                        let timeNode = getChildTag(tsn, 'time');
                                        if (timeNode) { tStart = parseInt(timeNode.getAttribute('start'))||0; tEnd = parseInt(timeNode.getAttribute('end'))||0; }
                                    }
                                    elements[id] = { id, name, type: 'Transition', subType, x, y, parentId, isRef: false, timeStart: tStart, timeEnd: tEnd };
                                }
                            } else if (tag === 'arc') {
                                let src = child.getAttribute('source'), dst = child.getAttribute('target'), aType = 'normal';
                                let tsn = getChildTag(child, 'toolspecific'); if (tsn && tsn.getAttribute('type') === 'inhibitor') aType = 'inhibitor';
                                arcs.push({src, dst, type: aType});
                            }
                        }
                    }
                    const rootPage = getChildTag(net, 'page'); if (rootPage) parseXMLNode(rootPage, null);
                }

                let maxNum = 0; for (let id in elements) { let num = parseInt(id.replace(/\D/g, '')); if (!isNaN(num) && num > maxNum) maxNum = num; }
                counter = maxNum + 1; scale = 1; offsetX = 0; offsetY = 0; setZoom(1); markClean();

                if (!hasPageGraphics) runAutoLayout();
                else redraw();
            };
            reader.readAsText(file);
        }

        function generatePNMLString() {
            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">\n';
            xml += `  <net id="${modelName}" type="http://www.pnml.org/version-2009/grammar/ptnet">\n`;
            xml += `    <name><text>${modelName}</text></name>\n`;

            const cbgroups = Object.values(elements).filter(e => e.subType === 'CBGroup');
            if (cbgroups.length > 0) {
                xml += `    <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n      <callbackgroups>\n`;
                cbgroups.forEach(cb => {
                    xml += `        <group>\n          <id>${cb.name}</id>\n          <type>${cb.meta.cbType.toLowerCase()}</type>\n          <priority>${cb.meta.prio}</priority>\n`;
                    xml += `          <graphics><position x="${cb.x}" y="${cb.y}"/><dimension x="${cb.w}" y="${cb.h}"/></graphics>\n`;
                    if (cb.parentId) xml += `          <node>${getAncestorNodeName(cb.id)}</node>\n`;
                    xml += `        </group>\n`;
                });
                xml += `      </callbackgroups>\n    </toolspecific>\n`;
            }

            xml += `    <page id="root">\n`;

            function serializeNode(id) {
                const el = elements[id]; let out = '';
                if (el.type === 'Page') {
                    if (['Topic', 'Service', 'CBGroup', 'Channel'].includes(el.subType)) return out;
                    const tMap = { 'Node': 'nodePage', 'Timer': 'callbackTimer', 'Sub': 'callbackSubscriber', 'Server': 'callbackServer' };
                    const tag = tMap[el.subType] || 'page';

                    if (tag === 'nodePage') {
                        out += `      <nodePage id="${el.id}">\n        <name><text>${el.name}</text></name>\n`;
                        out += `        <graphics><position x="${el.x}" y="${el.y}"/><dimension x="${el.w}" y="${el.h}"/></graphics>\n`;
                        out += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n          <type>nodePage</type>\n          <executor>${el.meta.exec.toLowerCase()}</executor>\n          <threads>${el.meta.threads}</threads>\n        </toolspecific>\n`;
                        for (let cid in elements) {
                            if (elements[cid].parentId === el.id && elements[cid].subType !== 'CBGroup') out += serializeNode(cid);
                            else if (elements[cid].parentId === el.id && elements[cid].subType === 'CBGroup') {
                                for (let sid in elements) { if (elements[sid].parentId === elements[cid].id) out += serializeNode(sid); }
                            }
                        }
                        out += `      </nodePage>\n`;
                    } else if (['callbackTimer', 'callbackSubscriber', 'callbackServer'].includes(tag)) {
                        out += `      <page id="${el.id}">\n        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n          <type>${tag}</type>\n`;
                        const cbParent = elements[el.parentId]; if (cbParent) out += `          <group>${cbParent.name}</group>\n`;
                        if (el.meta.t) out += `          <timer>${el.meta.t}</timer>\n`;
                        out += `          <priority>${el.meta.prio}</priority>\n        </toolspecific>\n`;
                        out += `        <name><text>${el.name}</text></name>\n`;
                        out += `        <graphics><position x="${el.x}" y="${el.y}"/><dimension x="${el.w}" y="${el.h}"/></graphics>\n`;
                        for (let cid in elements) { if (elements[cid].parentId === el.id) out += serializeNode(cid); }
                        out += `      </page>\n`;
                    } else {
                        out += `      <page id="${el.id}">\n        <name><text>${el.name}</text></name>\n`;
                        out += `        <graphics><position x="${el.x}" y="${el.y}"/><dimension x="${el.w}" y="${el.h}"/></graphics>\n`;
                        for (let cid in elements) { if (elements[cid].parentId === el.id) out += serializeNode(cid); }
                        out += `      </page>\n`;
                    }
                } else if (el.type === 'Place' || el.type === 'Port') {
                    const tag = el.isRef ? 'referencePlace' : 'place';
                    out += `      <${tag} id="${el.id}"${el.isRef ? ` ref="${el.targetId || ''}"` : ''}>\n`;
                    if (['placeStart', 'placeEnd'].includes(el.subType)) {
                        let pType = el.subType === 'placeStart' ? 'placeStartType' : 'placeEndType';
                        let ancNode = getAncestorNodeName(el.id);
                        out += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n          <type>${pType}</type>\n`;
                        if (ancNode) out += `          <node>${ancNode}</node>\n`;
                        out += `        </toolspecific>\n`;
                    }
                    out += `        <name><text>${el.name}</text></name>\n        <graphics><position x="${el.x}" y="${el.y}"/></graphics>\n`;
                    if (el.tokens > 0) out += `        <initialMarking><text>${el.tokens}</text></initialMarking>\n`;
                    out += `      </${tag}>\n`;
                } else if (el.type === 'Transition') {
                    const tag = el.isRef ? 'referenceTransition' : 'transition';
                    out += `      <${tag} id="${el.id}"${el.isRef ? ` ref="${el.targetId || ''}"` : ''}>\n`;
                    if (!el.isRef) {
                        out += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.2">\n`;
                        if (['timed', 'transitionStart', 'transitionEnd'].includes(el.subType)) {
                            let tType = 'timeTransitionType';
                            if (el.subType === 'transitionStart') tType = 'transitionStartType';
                            if (el.subType === 'transitionEnd') tType = 'transitionEndType';
                            out += `          <type>${tType}</type>\n`;
                            let ancNode = getAncestorNodeName(el.id);
                            if (ancNode) out += `          <node>${ancNode}</node>\n`;
                            if (el.subType === 'timed') out += `          <time start="${el.timeStart}" end="${el.timeEnd}"/>\n`;
                        } else out += `          <type>discreteTransitionType</type>\n`;
                        out += `        </toolspecific>\n`;
                    }
                    out += `        <name><text>${el.name}</text></name>\n        <graphics><position x="${el.x}" y="${el.y}"/></graphics>\n      </${tag}>\n`;
                }
                return out;
            }

            for (let id in elements) { if (!elements[id].parentId && !['Topic', 'Service', 'Channel'].includes(elements[id].subType)) xml += serializeNode(id); }

            arcs.forEach((arc, i) => {
                if (elements[arc.src] && elements[arc.dst] && elements[arc.src].type !== 'Port' && elements[arc.dst].type !== 'Port') {
                    xml += `      <arc id="a${i}" source="${arc.src}" target="${arc.dst}">\n`;
                    if (arc.type === 'inhibitor') xml += `        <toolspecific tool="ModernPetriEditor" version="1.0" type="inhibitor"/>\n`;
                    xml += `      </arc>\n`;
                }
            });

            const topics = Object.values(elements).filter(e => e.subType === 'Topic');
            topics.forEach(t => {
                xml += `      <transition id="${t.id}">\n        <graphics><position x="${t.x}" y="${t.y}"/><dimension x="${t.w}" y="${t.h}"/></graphics>\n`;
                xml += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.1">\n          <type>topicTransitionType</type>\n          <topicName>${t.name}</topicName>\n          <publishers>\n`;
                const pubs = Object.values(elements).filter(e => e.parentId === t.id && e.name === 'publisher');
                pubs.forEach(p => { if (p.targetId) xml += `            <publisher>\n              <id>${p.targetId}</id>\n              <limit>${p.limit !== undefined ? p.limit : 0}</limit>\n            </publisher>\n`; });
                xml += `          </publishers>\n          <subscribers>\n`;
                const subs = Object.values(elements).filter(e => e.parentId === t.id && e.name === 'subscriber');
                subs.forEach(s => { if (s.targetId) xml += `            <subscriber>\n              <id>${s.targetId}</id>\n              <limit>${s.limit !== undefined ? s.limit : 0}</limit>\n            </subscriber>\n`; });
                xml += `          </subscribers>\n        </toolspecific>\n        <name><text>${t.name}</text></name>\n      </transition>\n`;
            });

            const services = Object.values(elements).filter(e => e.subType === 'Service');
            services.forEach(s => {
                xml += `      <transition id="${s.id}">\n        <graphics><position x="${s.x}" y="${s.y}"/><dimension x="${s.w}" y="${s.h}"/></graphics>\n`;
                xml += `        <toolspecific tool="de.tudresden.inf.st.pnml.distributedPN" version="0.1">\n          <type>serviceTransitionType</type>\n          <serviceName>${s.name}</serviceName>\n`;
                const sReqPort = Object.values(elements).find(e => e.parentId === s.id && e.name === 'server_req');
                const sResPort = Object.values(elements).find(e => e.parentId === s.id && e.name === 'server_res');

                xml += `          <serverInput>${sReqPort?.targetId || ''}</serverInput>\n          <serverOutput>${sResPort?.targetId || ''}</serverOutput>\n          <serverCapacity>${s.meta?.capacity !== undefined ? s.meta.capacity : 1}</serverCapacity>\n          <channels>\n`;

                const channels = Object.values(elements).filter(e => e.parentId === s.id && e.subType === 'Channel');
                channels.forEach(ch => {
                    const cReq = Object.values(elements).find(e => e.parentId === ch.id && e.name === 'request');
                    const cRes = Object.values(elements).find(e => e.parentId === ch.id && e.name === 'response');

                    xml += `            <channel>\n              <cid>${ch.id}</cid>\n              <request>${cReq?.targetId || ''}</request>\n              <response>${cRes?.targetId || ''}</response>\n            </channel>\n`;
                });
                xml += `          </channels>\n        </toolspecific>\n        <name><text>${s.name}</text></name>\n      </transition>\n`;
            });

            xml += '    </page>\n  </net>\n</pnml>';
            return xml;
        }

        document.getElementById('btn-save').addEventListener('click', () => {
            showToast("Saving...", false);
            const blob = new Blob([generatePNMLString()], { type: 'text/xml' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${modelName}.pnml`; a.click(); markClean();
        });
