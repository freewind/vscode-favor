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
        Object.entries(groups).forEach(([groupName, items]) => {
            this.groups.set(groupName, new Map(items.map(item => [item.path, item])));
        });
    }

    saveFavorites() {
        const favoritesArray = Array.from(this.favorites.values());
        const groupsObject = {};
        this.groups.forEach((items, groupName) => {
            groupsObject[groupName] = Array.from(items.values());
        });
        
        this.context.globalState.update('favorites', favoritesArray);
        this.context.globalState.update('favoriteGroups', groupsObject);
    }

    getTreeItem(element) {
        if (element.isGroup) {
            const treeItem = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Expanded
            );
            treeItem.contextValue = 'group';
            treeItem.iconPath = new vscode.ThemeIcon('folder-opened');
            
            treeItem.buttons = [
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
            
            const groupItems = this.groups.get(element.name);
            if (groupItems && groupItems.size > 0) {
                const firstFile = Array.from(groupItems.values())[0];
                treeItem.resourceUri = vscode.Uri.file(firstFile.path);
            }
            
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
            const defaultItems = Array.from(this.favorites.values());
            const groups = Array.from(this.groups.keys()).map(name => ({
                name,
                isGroup: true
            }));
            return [...defaultItems, ...groups];
        }
        
        if (element.isGroup) {
            const groupItems = this.groups.get(element.name);
            return groupItems ? Array.from(groupItems.values()).map(item => ({
                ...item,
                groupName: element.name,
                contextValue: 'file'
            })) : [];
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
        if (item.groupName) {
            if (this.groups.has(item.groupName)) {
                this.groups.get(item.groupName).delete(item.path);
                if (this.groups.get(item.groupName).size === 0) {
                    this.groups.delete(item.groupName);
                }
            }
        } else {
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
                        // 创建新项
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
            // 如果目标是默认分组区域
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
                    // 删除旧组
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

    async addNewGroup() {
        console.log('\n### > addNewGroup start');
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
            // 创建新的空分组
            this.groups.set(groupName, new Map());
            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
        console.log('\n### > addNewGroup end');
    }

    async moveToGroup(item) {
        console.log('\n### > moveToGroup:', JSON.stringify(item, null, 2));
        
        // 准备分组列表，包括默认分组
        const groups = ['(Default Group)', ...Array.from(this.groups.keys())];
        // 排除当前所在分组
        const availableGroups = groups.filter(g => g !== item.groupName);
        
        // 让用户选择目标分组
        const targetGroup = await vscode.window.showQuickPick(availableGroups, {
            placeHolder: 'Select target group'
        });

        if (targetGroup) {
            console.log('\n### > Moving to group:', targetGroup);
            
            // 从原分组移除
            if (item.groupName) {
                // 从组内移除
                this.groups.get(item.groupName).delete(item.path);
                if (this.groups.get(item.groupName).size === 0) {
                    this.groups.delete(item.groupName);
                }
            } else {
                // 从默认分组移除
                this.favorites.delete(item.path);
            }

            // 添加到新分组
            if (targetGroup === '(Default Group)') {
                // 移动到默认分组
                delete item.groupName;
                this.favorites.set(item.path, item);
            } else {
                // 移动到指定分组
                item.groupName = targetGroup;
                if (!this.groups.has(targetGroup)) {
                    this.groups.set(targetGroup, new Map());
                }
                this.groups.get(targetGroup).set(item.path, item);
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
    }

    async copyToGroup(item) {
        console.log('\n### > copyToGroup:', JSON.stringify(item, null, 2));
        
        // 准备分组列表，包括默认分组
        const groups = ['(Default Group)', ...Array.from(this.groups.keys())];
        // 排除当前所在分组
        const availableGroups = groups.filter(g => g !== item.groupName);
        
        // 让用户选择目标分组
        const targetGroup = await vscode.window.showQuickPick(availableGroups, {
            placeHolder: 'Select target group'
        });

        if (targetGroup) {
            console.log('\n### > Copying to group:', targetGroup);
            
            // 创建项目的副本
            const newItem = { ...item };
            
            // 添加到新分组
            if (targetGroup === '(Default Group)') {
                // 复制到默认分组
                delete newItem.groupName;
                this.favorites.set(newItem.path, newItem);
            } else {
                // 复制到指定分组
                newItem.groupName = targetGroup;
                if (!this.groups.has(targetGroup)) {
                    this.groups.set(targetGroup, new Map());
                }
                this.groups.get(targetGroup).set(newItem.path, newItem);
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
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

    let addToFavorites = vscode.commands.registerCommand('vscode-favorites.addToFavorites', (uri) => {
        if (!uri) {
            uri = vscode.window.activeTextEditor?.document.uri;
        }
        if (uri) {
            favoritesProvider.addFavorite(uri);
        }
    });

    let removeFromFavorites = vscode.commands.registerCommand('vscode-favorites.removeFromFavorites', (item) => {
        if (item) {
            favoritesProvider.removeFavorite(item);
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

    let addToGroup = vscode.commands.registerCommand('vscode-favorites.addToGroup', async (uri) => {
        if (!uri) {
            uri = vscode.window.activeTextEditor?.document.uri;
        }
        if (uri) {
            await favoritesProvider.addToGroup(uri);
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
    let addNewGroup = vscode.commands.registerCommand('vscode-favorites.addNewGroup', async () => {
        await favoritesProvider.addNewGroup();
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