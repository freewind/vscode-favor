const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class FavoritesProvider {
    constructor(context) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.favorites = new Map();
        this.groups = new Map();
        this.context = context;
        this.view = null;
        this.loadFavorites();
    }

    loadFavorites() {
        const favorites = this.context.globalState.get('favorites', []);
        favorites.forEach(item => {
            this.favorites.set(item.path, item);
        });
        
        const groups = this.context.globalState.get('favoriteGroups', {});
        Object.entries(groups).forEach(([groupName, group]) => {
            this.groups.set(groupName, {
                files: new Map(group.files?.map(item => [item.path, item]) || []),
                subGroups: new Map(group.subGroups || []),
                parentGroup: group.parentGroup || null
            });
        });
    }

    saveFavorites() {
        const favoritesArray = Array.from(this.favorites.values());
        const groupsObject = {};
        this.groups.forEach((group, groupName) => {
            groupsObject[groupName] = {
                files: Array.from(group.files.values()),
                subGroups: Array.from(group.subGroups.entries()),
                parentGroup: group.parentGroup
            };
        });
        
        this.context.globalState.update('favorites', favoritesArray);
        this.context.globalState.update('favoriteGroups', groupsObject);
    }

    getTreeItem(element) {
        if (element.isGroup) {
            const group = this.groups.get(element.name);
            const fileCount = group.files.size;
            const subGroupCount = group.subGroups.size;
            
            const treeItem = new vscode.TreeItem(
                `${element.name} (${fileCount} files, ${subGroupCount} groups)`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            treeItem.contextValue = 'group';
            treeItem.iconPath = new vscode.ThemeIcon('folder-opened');
            
            treeItem.buttons = [
                {
                    icon: new vscode.ThemeIcon('add'),
                    tooltip: 'Add New Group',
                    command: {
                        command: 'vscode-favorites.addNewGroup',
                        arguments: [element],  // 传入父组
                        title: 'Add New Group'
                    }
                },
                {
                    icon: new vscode.ThemeIcon('edit'),
                    tooltip: 'Rename Group',
                    command: {
                        command: 'vscode-favorites.renameGroup',
                        arguments: [element],
                        title: 'Rename Group'
                    }
                },
                {
                    icon: new vscode.ThemeIcon('trash'),
                    tooltip: 'Delete Group',
                    command: {
                        command: 'vscode-favorites.deleteGroup',
                        arguments: [element],
                        title: 'Delete Group'
                    }
                }
            ];
            
            return treeItem;
        }

        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        
        if (element.type === 'file') {
            treeItem.command = {
                command: 'vscode-favorites.openFavoriteFile',
                arguments: [element],
                title: 'Open File'
            };
            treeItem.resourceUri = vscode.Uri.file(element.path);
        }
        
        treeItem.iconPath = element.type === 'folder' ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file');
        treeItem.contextValue = element.type;

        if (!element.isGroup) {
            treeItem.buttons = [
                {
                    icon: new vscode.ThemeIcon('trash'),
                    tooltip: 'Remove from Favorites',
                    command: {
                        command: 'vscode-favorites.removeFromFavorites',
                        arguments: [element],
                        title: 'Remove from Favorites'
                    }
                }
            ];
        }

        return treeItem;
    }

    getChildren(element) {
        if (!element) {
            // 根级别：显示默认收藏和顶级分组
            const defaultItems = Array.from(this.favorites.values());
            const topGroups = Array.from(this.groups.entries())
                .filter(([_, group]) => !group.parentGroup)
                .map(([name]) => ({
                    name,
                    isGroup: true
                }));
            return [...defaultItems, ...topGroups];
        }
        
        if (element.isGroup) {
            const group = this.groups.get(element.name);
            if (!group) return [];

            // 显示分组的文件和子分组
            const files = Array.from(group.files.values()).map(item => ({
                ...item,
                groupName: element.name,
                contextValue: 'file'
            }));
            
            const subGroups = Array.from(group.subGroups.keys()).map(name => ({
                name,
                isGroup: true,
                parentGroup: element.name
            }));

            return [...files, ...subGroups];
        }
        
        return [];
    }

    addFavorite(uri) {
        const stat = fs.statSync(uri.fsPath);
        const favorite = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file'
        };
        this.favorites.set(uri.fsPath, favorite);
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    removeFavorite(item) {
        console.log('\n### > Removing favorite:', JSON.stringify(item, null, 2));
        if (item.groupName) {
            console.log('Removing from group:', item.groupName);
            if (this.groups.has(item.groupName)) {
                this.groups.get(item.groupName).delete(item.path);
                if (this.groups.get(item.groupName).size === 0) {
                    this.groups.delete(item.groupName);
                }
            }
        } else {
            console.log('Removing from default group');
            this.favorites.delete(item.path);
        }
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    getGroups() {
        return Array.from(this.groups.keys());
    }

    async addToGroup(uri, groupName) {
        if (!groupName) {
            const groups = this.getGroups();
            const items = [];
            
            groups.forEach(group => {
                items.push({
                    label: group,
                    group: true
                });
            });

            if (groups.length > 0) {
                items.push({ kind: vscode.QuickPickItemKind.Separator });
            }
            items.push({
                label: "New Group...",
                group: false
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select or create a group'
            });

            if (!selected) return;

            if (!selected.group) {
                const newGroupName = await vscode.window.showInputBox({
                    placeHolder: "Enter group name",
                    prompt: "Enter a name for the new favorite group"
                });
                if (!newGroupName) return;
                groupName = newGroupName;
            } else {
                groupName = selected.label;
            }
        }

        if (!this.groups.has(groupName)) {
            this.groups.set(groupName, new Map());
        }

        const stat = fs.statSync(uri.fsPath);
        const favorite = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file',
            groupName: groupName
        };

        this.groups.get(groupName).set(uri.fsPath, favorite);
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    removeFromGroup(item, groupName) {
        if (this.groups.has(groupName)) {
            this.groups.get(groupName).delete(item.path);
            if (this.groups.get(groupName).size === 0) {
                this.groups.delete(groupName);
            }
            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
    }

    setTreeView(view) {
        this.view = view;
    }

    getSelectedItems() {
        return this.view ? this.view.selection : [];
    }

    async getDragUri(item) {
        console.log('\n=== getDragUri Start ===');
        console.log('Input item:', JSON.stringify(item, null, 2));
        
        if (item.isGroup) {
            console.log('Processing group:', item.name);
            const groupItems = this.groups.get(item.name);
            console.log('Raw group items:', JSON.stringify(Array.from(groupItems.values()), null, 2));
            
            if (groupItems) {
                const filteredItems = Array.from(groupItems.values()).filter(item => item.type === 'file');
                console.log('Filtered file items:', JSON.stringify(filteredItems, null, 2));
                
                const uris = filteredItems.map(item => {
                    const uri = vscode.Uri.file(item.path);
                    console.log('Created URI:', uri.toString(), 'for path:', item.path);
                    return uri;
                });
                
                console.log('=== getDragUri End ===\n');
                return uris;
            }
            console.log('No items found in group');
            console.log('=== getDragUri End ===\n');
            return [];
        }
        
        console.log('Processing single item:', item.path);
        console.log('=== getDragUri End ===\n');
        return vscode.Uri.file(item.path);
    }

    async handleDrag(items, dataTransfer, token) {
        console.log('\n=== handleDrag Start ===');
        console.log('Input items:', JSON.stringify(items, null, 2));
        
        try {
            // 设置拖拽数据
            const dragData = {
                items: items,
                isCopy: false  // 默认为移动操作
            };

            // 检查是否按下了修饰键
            if (process.platform === 'darwin') {
                dragData.isCopy = token.isCancellationRequested;
                console.log('macOS: Command key state:', dragData.isCopy);
            } else {
                dragData.isCopy = token.isCancellationRequested;
                console.log('Windows/Linux: Ctrl key state:', dragData.isCopy);
            }

            console.log('Prepared drag data:', JSON.stringify(dragData, null, 2));
            
            // 设置拖拽数据
            const transferItem = new vscode.DataTransferItem(dragData);
            dataTransfer.set('application/vnd.code.tree.favoritesList', transferItem);
            console.log('Set favoritesList data');
            
            // 设置拖拽效果
            dataTransfer.set('vscode-drag-effect', new vscode.DataTransferItem(dragData.isCopy ? 'copy' : 'move'));
            console.log('Set drag effect:', dragData.isCopy ? 'copy' : 'move');
        } catch (error) {
            console.error('Error in handleDrag:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        console.log('=== handleDrag End ===\n');
    }

    async handleDrop(target, dataTransfer, token) {
        console.log('\n=== handleDrop Start ===');
        console.log('Target:', JSON.stringify(target, null, 2));
        
        try {
            // 直接从 dataTransfer 获取数据
            const transferItem = dataTransfer.get('application/vnd.code.tree.favoritesList');
            console.log('Transfer item:', transferItem ? 'found' : 'not found');
            
            if (!transferItem) {
                console.log('No transfer item found');
                return;
            }

            const dragData = transferItem.value;
            console.log('Drag data:', JSON.stringify(dragData, null, 2));

            const items = dragData.items;
            const isCopy = dragData.isCopy;
            console.log('Processing items:', JSON.stringify(items, null, 2));
            console.log('Operation type:', isCopy ? 'copy' : 'move');

            // 如果目标是分组
            if (target && target.isGroup) {
                console.log('Dropping into group:', target.name);
                for (const source of items) {
                    if (source.type === 'file') {
                        console.log('Processing file:', source.path);
                        // 创新项
                        const newItem = { ...source, groupName: target.name };
                        
                        // 如果不是复制操作，从原位置移除
                        if (!isCopy) {
                            if (source.groupName) {
                                console.log('Removing from source group:', source.groupName);
                                this.groups.get(source.groupName)?.delete(source.path);
                            } else {
                                console.log('Removing from default group');
                                this.favorites.delete(source.path);
                            }
                        }

                        // 添加到目标分组
                        if (!this.groups.has(target.name)) {
                            console.log('Creating new group:', target.name);
                            this.groups.set(target.name, new Map());
                        }
                        console.log('Adding to target group:', target.name);
                        this.groups.get(target.name).set(source.path, newItem);
                    }
                }
            }
            // 如目标是默认分组区域
            else if (!target) {
                console.log('Dropping into default group');
                for (const source of items) {
                    if (source.type === 'file' && source.groupName) {
                        console.log('Processing file:', source.path);
                        // 创建新项
                        const newItem = { ...source };
                        delete newItem.groupName;
                        
                        // 如果不是复制操作，从原分组移除
                        if (!isCopy) {
                            console.log('Removing from source group:', source.groupName);
                            this.groups.get(source.groupName)?.delete(source.path);
                        }
                        
                        console.log('Adding to default group');
                        this.favorites.set(source.path, newItem);
                    }
                }
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
            console.log('Operation completed successfully');
            
        } catch (error) {
            console.error('Error in handleDrop:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        console.log('=== handleDrop End ===\n');
    }

    async renameGroup(groupElement) {
        console.log('\n### > renameGroup:', JSON.stringify(groupElement, null, 2));
        if (groupElement && groupElement.isGroup) {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new group name',
                value: groupElement.name,
                validateInput: value => {
                    if (!value) return 'Group name cannot be empty';
                    if (this.groups.has(value) && value !== groupElement.name) {
                        return 'Group name already exists';
                    }
                    return null;
                }
            });

            if (newName && newName !== groupElement.name) {
                console.log('\n### > Renaming group from', groupElement.name, 'to', newName);
                // 获取旧组的内容
                const groupItems = this.groups.get(groupElement.name);
                if (groupItems) {
                    // 创建新组并复制内容
                    this.groups.set(newName, groupItems);
                    // 删除组
                    this.groups.delete(groupElement.name);
                    // 更新所有项的 groupName
                    groupItems.forEach(item => {
                        item.groupName = newName;
                    });
                    // 保存并刷新视图
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }

    async deleteGroup(groupElement) {
        console.log('\n### > deleteGroup:', JSON.stringify(groupElement, null, 2));
        if (groupElement && groupElement.isGroup) {
            const groupItems = this.groups.get(groupElement.name);
            if (groupItems) {
                // 先确认是否要删除
                const answer = await vscode.window.showWarningMessage(
                    `Do you want to delete group "${groupElement.name}"?`,
                    { modal: true },
                    'Delete Group and Files',
                    'Move Files to Default'
                );

                if (answer === 'Delete Group and Files') {
                    // 删除分组及其所有文件
                    console.log('\n### > Deleting group and files:', groupElement.name);
                    this.groups.delete(groupElement.name);
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                } else if (answer === 'Move Files to Default') {
                    // 将文件移动到默认分组
                    console.log('\n### > Moving files to default group');
                    const files = Array.from(groupItems.values());
                    files.forEach(file => {
                        // 移除 groupName 属性
                        delete file.groupName;
                        this.favorites.set(file.path, file);
                    });
                    // 删除原分组
                    this.groups.delete(groupElement.name);
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
                // 如果用户点击取消按钮，什么也不做
            }
        }
    }

    async addNewGroup(parentGroup) {
        console.log('\n### > addNewGroup start with parent:', JSON.stringify(parentGroup, null, 2));
        const groupName = await vscode.window.showInputBox({
            prompt: 'Enter new group name',
            validateInput: value => {
                if (!value) return 'Group name cannot be empty';
                if (this.groups.has(value)) {
                    return 'Group name already exists';
                }
                return null;
            }
        });

        if (groupName) {
            console.log('\n### > Creating new group:', groupName);
            // 创建新的空分组，包含完整的数据结构
            this.groups.set(groupName, {
                files: new Map(),          // 存储文件
                subGroups: new Map(),      // 存储子分组
                parentGroup: parentGroup ? parentGroup.name : null  // 存储父分组引用
            });
            
            // 如果有父分组，将新分组添加到父分组的 subGroups 中
            if (parentGroup) {
                const parent = this.groups.get(parentGroup.name);
                if (parent) {
                    parent.subGroups.set(groupName, true);
                }
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
        console.log('\n### > addNewGroup end');
    }

    async moveToGroup(item, targetGroup) {
        if (!targetGroup) {
            // 获取所有选中的项目
            const selectedItems = item ? 
                [item, ...this.view.selection.filter(i => i !== item)] : 
                this.view.selection;

            console.log('\n### > Selected items for move:', JSON.stringify(selectedItems, null, 2));
            
            if (selectedItems && selectedItems.length > 0) {
                // 准备分组列表，包括默认分组
                const groups = ['(Default Group)', ...Array.from(this.groups.keys())];
                // 排除当前所在分组（如果所有项都在同一个分组）
                const currentGroup = selectedItems[0].groupName;
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = allSameGroup ? 
                    groups.filter(g => g !== currentGroup) : 
                    groups;
                
                // 让用户选择目标分组
                const targetGroup = await vscode.window.showQuickPick(availableGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroup) {
                    // 移动所有选中的项目
                    for (const item of selectedItems) {
                        if (targetGroup === '(Default Group)') {
                            // 移动到默认分组
                            if (item.groupName) {
                                this.groups.get(item.groupName).files.delete(item.path);
                            }
                            delete item.groupName;
                            this.favorites.set(item.path, item);
                        } else {
                            // 移动到指定分组
                            if (item.groupName) {
                                this.groups.get(item.groupName).files.delete(item.path);
                            } else {
                                this.favorites.delete(item.path);
                            }
                            item.groupName = targetGroup;
                            if (!this.groups.has(targetGroup)) {
                                this.groups.set(targetGroup, {
                                    files: new Map(),
                                    subGroups: new Map(),
                                    parentGroup: null
                                });
                            }
                            this.groups.get(targetGroup).files.set(item.path, item);
                        }
                    }
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }

    async copyToGroup(item, targetGroup) {
        if (!targetGroup) {
            // 获取所有选中的项目
            const selectedItems = item ? 
                [item, ...treeView.selection.filter(i => i !== item)] : 
                treeView.selection;

            console.log('\n### > Selected items for copy:', JSON.stringify(selectedItems, null, 2));
            
            if (selectedItems && selectedItems.length > 0) {
                // 准备分组列表，包括默认分组
                const groups = ['(Default Group)', ...Array.from(this.groups.keys())];
                // 排除当前所在分组（如果所有项都在同一个分组）
                const currentGroup = selectedItems[0].groupName;
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = allSameGroup ? 
                    groups.filter(g => g !== currentGroup) : 
                    groups;
                
                // 让用户选择目标分组
                const targetGroup = await vscode.window.showQuickPick(availableGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroup) {
                    // 复制所有选中的项目
                    for (const item of selectedItems) {
                        const newItem = { ...item };
                        if (targetGroup === '(Default Group)') {
                            delete newItem.groupName;
                            this.favorites.set(newItem.path, newItem);
                        } else {
                            newItem.groupName = targetGroup;
                            // 确保目标分组存在且有正确的数据结构
                            if (!this.groups.has(targetGroup)) {
                                this.groups.set(targetGroup, {
                                    files: new Map(),
                                    subGroups: new Map(),
                                    parentGroup: null
                                });
                            }
                            // 使用 files Map 来存储文件
                            this.groups.get(targetGroup).files.set(newItem.path, newItem);
                        }
                    }
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }
}

function activate(context) {
    const favoritesProvider = new FavoritesProvider(context);
    
    const treeView = vscode.window.createTreeView('favoritesList', {
        treeDataProvider: favoritesProvider,
        canSelectMany: true,
        dragAndDropController: {
            dropMimeTypes: ['application/vnd.code.tree.favoritesList'],
            dragMimeTypes: ['application/vnd.code.tree.favoritesList'],
            handleDrag: (items, dataTransfer, token) => favoritesProvider.handleDrag(items, dataTransfer, token),
            handleDrop: (target, dataTransfer, token) => favoritesProvider.handleDrop(target, dataTransfer, token)
        }
    });
    
    favoritesProvider.setTreeView(treeView);

    let addToFavorites = vscode.commands.registerCommand('vscode-favorites.addToFavorites', async (uri, uris) => {
        if (uris) {
            // 如果提供了多个 URI，添加所有文件
            uris.forEach(uri => favoritesProvider.addFavorite(uri));
        } else if (uri) {
            // 如果只提供了一个 URI，添加单个文件
            favoritesProvider.addFavorite(uri);
        } else {
            // 如果没有提供 URI，使用当前活动编辑器
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            if (activeUri) {
                favoritesProvider.addFavorite(activeUri);
            }
        }
    });

    let removeFromFavorites = vscode.commands.registerCommand('vscode-favorites.removeFromFavorites', async (item) => {
        // 如果是从按钮点击，获取所有选中的项目
        const selectedItems = item ? 
            // 如果是从按钮点击，合并当前项和其他选中项
            [item, ...treeView.selection.filter(i => i !== item)] : 
            // 如果是从右键菜单，直接获取所有选中项
            treeView.selection;

        console.log('\n### > Selected items for removal:', JSON.stringify(selectedItems, null, 2));
        
        if (selectedItems && selectedItems.length > 0) {
            let message;
            if (selectedItems.length === 1) {
                const item = selectedItems[0];
                const itemDesc = item.groupName ? 
                    `"${item.name}" from group "${item.groupName}"` : 
                    `"${item.name}"`;
                message = `Are you sure you want to remove ${itemDesc} from favorites?`;
            } else {
                // 按组分类文件
                const groupedFiles = new Map();
                selectedItems.forEach(item => {
                    const groupName = item.groupName || '(Default Group)';
                    if (!groupedFiles.has(groupName)) {
                        groupedFiles.set(groupName, []);
                    }
                    groupedFiles.get(groupName).push(item.name);
                });

                // 构建消息
                message = `Are you sure you want to remove these ${selectedItems.length} files from favorites?\n\n`;
                for (const [groupName, files] of groupedFiles) {
                    message += `${groupName}:\n`;
                    files.forEach(fileName => {
                        message += `  • ${fileName}\n`;
                    });
                    message += '\n';
                }
            }
            
            const answer = await vscode.window.showWarningMessage(
                message,
                { modal: true, detail: selectedItems.length > 1 ? 'This action cannot be undone.' : undefined },
                'Remove'
            );

            if (answer === 'Remove') {
                selectedItems.forEach(item => {
                    favoritesProvider.removeFavorite(item);
                });
            }
        }
    });

    let openFavoriteFiles = vscode.commands.registerCommand('vscode-favorites.openFavoriteFiles', async () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        for (const item of selectedItems) {
            if (item.type === 'file') {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
            }
        }
    });

    let openSelectedFiles = vscode.commands.registerCommand('vscode-favorites.openSelectedFiles', () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        if (selectedItems) {
            selectedItems.forEach(item => {
                if (item.type === 'file') {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
                }
            });
        }
    });

    let openFavoriteFile = vscode.commands.registerCommand('vscode-favorites.openFavoriteFile', (item) => {
        if (item && item.type === 'file') {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
        }
    });

    let addToGroup = vscode.commands.registerCommand('vscode-favorites.addToGroup', async (uri, uris) => {
        console.log('\n### > addToGroup called with:', {
            uri: uri?.fsPath,
            uris: uris?.map(u => u.fsPath)
        });

        // 收集所有需要添加的 URI
        let urisToAdd = [];
        if (uris) {
            // 如果提供了多个 URI，添加所有文件
            urisToAdd = uris;
        } else if (uri) {
            // 如果只提供了一个 URI，添加单个文件
            urisToAdd = [uri];
        } else {
            // 如果没有提供 URI，使用当前活动编辑器
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            if (activeUri) {
                urisToAdd = [activeUri];
            }
        }

        // 如果有文件要添加
        if (urisToAdd.length > 0) {
            // 获取现有分组
            const groups = favoritesProvider.getGroups();
            const items = [];
            
            // 添加现有分组到选项中
            groups.forEach(group => {
                items.push({
                    label: group,
                    group: true
                });
            });

            // 添加分隔符和"New Group"选项
            if (groups.length > 0) {
                items.push({ kind: vscode.QuickPickItemKind.Separator });
            }
            items.push({
                label: "New Group...",
                group: false
            });

            // 显示快速选择菜单
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select or create a group'
            });

            if (selected) {
                let targetGroup = selected.label;
                if (!selected.group) {
                    // 如果选择了"New Group"，提示输入新组名
                    const newGroupName = await vscode.window.showInputBox({
                        placeHolder: "Enter group name",
                        prompt: "Enter a name for the new favorite group",
                        validateInput: value => {
                            if (!value) return 'Group name cannot be empty';
                            if (favoritesProvider.groups.has(value)) {
                                return 'Group name already exists';
                            }
                            return null;
                        }
                    });
                    if (!newGroupName) return;
                    targetGroup = newGroupName;
                }

                // 添加所有文件到目标分组
                for (const uri of urisToAdd) {
                    await favoritesProvider.addToGroup(uri, targetGroup);
                }
            }
        }
    });

    let removeFromGroup = vscode.commands.registerCommand('vscode-favorites.removeFromGroup', (item, groupName) => {
        if (item && groupName) {
            favoritesProvider.removeFromGroup(item, groupName);
        }
    });

    let renameGroup = vscode.commands.registerCommand('vscode-favorites.renameGroup', async (groupElement) => {
        await favoritesProvider.renameGroup(groupElement);
    });

    let deleteGroup = vscode.commands.registerCommand('vscode-favorites.deleteGroup', async (groupElement) => {
        await favoritesProvider.deleteGroup(groupElement);
    });

    // 注册添加新分组的命令
    let addNewGroup = vscode.commands.registerCommand('vscode-favorites.addNewGroup', async (parentGroup) => {
        await favoritesProvider.addNewGroup(parentGroup);
    });

    let moveToGroup = vscode.commands.registerCommand('vscode-favorites.moveToGroup', async (item) => {
        await favoritesProvider.moveToGroup(item);
    });

    let copyToGroup = vscode.commands.registerCommand('vscode-favorites.copyToGroup', async (item) => {
        await favoritesProvider.copyToGroup(item);
    });

    context.subscriptions.push(
        treeView,
        addToFavorites,
        removeFromFavorites,
        openFavoriteFiles,
        openSelectedFiles,
        openFavoriteFile,
        addToGroup,
        removeFromGroup,
        renameGroup,
        deleteGroup,
        addNewGroup,
        moveToGroup,
        copyToGroup
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
} 