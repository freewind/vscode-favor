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
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            
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
        
        let uris = [];
        for (const item of items) {
            const itemUris = await this.getDragUri(item);
            if (Array.isArray(itemUris)) {
                console.log(`Adding ${itemUris.length} URIs from group`);
                uris.push(...itemUris);
            } else {
                console.log('Adding single URI');
                uris.push(itemUris);
            }
        }
        
        console.log('All URIs collected:', uris.map(uri => uri.toString()));
        
        try {
            dataTransfer.set('vscode-file-uri-list', new vscode.DataTransferItem(uris));
            console.log('Added URIs with vscode-file-uri-list format');
            
            if (items[0].isGroup) {
                const groupItems = this.groups.get(items[0].name);
                if (groupItems && groupItems.size > 0) {
                    const firstFile = Array.from(groupItems.values())[0];
                    items[0].resourceUri = vscode.Uri.file(firstFile.path);
                    console.log('Set resourceUri for group:', items[0].resourceUri.toString());
                }
            }
        } catch (error) {
            console.error('Error in data transfer:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        
        console.log('=== handleDrag End ===\n');
    }
}

function activate(context) {
    const favoritesProvider = new FavoritesProvider(context);
    
    const treeView = vscode.window.createTreeView('favoritesList', {
        treeDataProvider: favoritesProvider,
        canSelectMany: true,
        dragAndDropController: {
            handleDrag: (items, dataTransfer, token) => favoritesProvider.handleDrag(items, dataTransfer, token)
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

    context.subscriptions.push(
        treeView,
        addToFavorites,
        removeFromFavorites,
        openFavoriteFiles,
        openSelectedFiles,
        openFavoriteFile,
        addToGroup,
        removeFromGroup
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
} 