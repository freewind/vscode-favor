/**
 * VS Code 扩展开发的重要概念：
 * 
 * 1. 扩展生命周期
 *    - activate: 扩展被激活时调用（首次使用相关功能时）
 *    - deactivate: 扩展被停用时调用（VS Code 关闭或扩展被禁用时）
 * 
 * 2. ExtensionContext
 *    - subscriptions: 用于注册需要清理的资源
 *    - globalState: 持久化存储，在 VS Code 重启后仍然存在
 *    - workspaceState: 工作区级别的存储
 * 
 * 3. TreeView API
 *    - TreeDataProvider: 提供树视图数据的接口
 *      - getTreeItem: 定义每个节点的外观和行为
 *      - getChildren: 定义树的层级结构
 *    - TreeItem: 树节点的配置对象
 *      - label: 显示的文本
 *      - contextValue: 用于 when 子句的类型标识
 *      - iconPath: 图标
 *      - command: 点击时执行的命令
 *      - resourceUri: 关联的文件路径
 *      - collapsibleState: 是否可展开/折叠
 * 
 * 4. 命令系统
 *    - registerCommand: 注册命令
 *    - executeCommand: 执行命令
 *    - 命令可以有参数，参数会传递给处理函数
 * 
 * 5. 用户界面 API
 *    - window.showInputBox: 显示输入框
 *    - window.showQuickPick: 显示快速选择列表
 *    - window.showWarningMessage: 显示警告消息
 * 
 * 6. 事件系统
 *    - EventEmitter: 用于发出事件
 *    - Event: 订阅事件的接口
 *    - 常用于通知 UI 更新
 * 
 * 7. 文件系统 API
 *    - Uri: 统一资源标识符，用于标识文件
 *    - workspace.fs: 文件系统操作
 *    - path/fs: Node.js 的文件操作模块
 * 
 * 8. 拖放系统
 *    - DataTransfer: 数据传输对象
 *    - DataTransferItem: 单个传输项
 *    - MIME 类型: 定义数据格式
 */

/**
 * VS Code 的常用设计模式：
 * 
 * 1. 命令模式
 *    - 所有用户操作都通过命令系统
 *    - 命令可以被菜单项、快捷键触发
 *    - 命令可以被程序调用
 * 
 * 2. 发布-订阅模式
 *    - 使用 EventEmitter 发出事件
 *    - 使用 Event 订阅事件
 *    - 用于组件间通信
 * 
 * 3. 提供者模式
 *    - TreeDataProvider 提供数据
 *    - VS Code 负责显示
 *    - 分离数据和显示
 */

/**
 * 扩展开发的最佳实践：
 * 
 * 1. 性能考虑
 *    - 按需激活扩展
 *    - 避免不必要的 UI 更新
 *    - 大量数据使用分页或虚拟化
 * 
 * 2. 用户体验
 *    - 提供清晰的错误信息
 *    - 危险操作要确认
 *    - 支持键盘操作
 * 
 * 3. 代码组织
 *    - 关注点分离
 *    - 模块化设计
 *    - 清晰的注释
 * 
 * 4. 调试技巧
 *    - 使用 console.log 输出信息
 *    - 在 launch.json 中配置调试
 *    - 使用 VS Code 的开发者工具
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * FavoritesProvider 类实现了 VS Code 的 TreeDataProvider 接口
 * 用于在侧边栏显示树形结构的收藏夹视图
 */
class FavoritesProvider {
    constructor(context) {
        // VS Code 的事件发射器，用于通知视图需要刷新
        // 当数据变化时，调用 this._onDidChangeTreeData.fire() 会触发视图刷新
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        // 存储收藏的文件，使用 Map 保证查找效率
        // key: 文件路径, value: 文件信息对象
        this.favorites = new Map();

        // 存储分组信息，使用嵌套的 Map 结构
        // key: 分组名称
        // value: {
        //   files: Map<文件路径, 文件信息>,
        //   subGroups: Map<子分组名称, true>,
        //   parentGroup: 父分组名称
        // }
        this.groups = new Map();

        // VS Code 的扩展上下文，用于存储全局状态
        this.context = context;

        // TreeView 实例的引用，用于获取选中项等信息
        this.view = null;

        // 当前激活的分组名称
        this.activeGroup = null;

        // 从全局状态加载保存的数据
        this.loadFavorites();
    }

    /**
     * 从 VS Code 的全局状态中加载收藏数据
     * globalState 是持久化的，在 VS Code 重启后仍然存在
     */
    loadFavorites() {
        // 加载默认分组的文件
        const favorites = this.context.globalState.get('favorites', []);
        favorites.forEach(item => {
            this.favorites.set(item.path, item);
        });
        
        // 加载分组数据，需要重建 Map 结构
        const groups = this.context.globalState.get('favoriteGroups', {});
        Object.entries(groups).forEach(([groupName, group]) => {
            this.groups.set(groupName, {
                files: new Map(group.files?.map(item => [item.path, item]) || []),
                subGroups: new Map(group.subGroups || []),
                parentGroup: group.parentGroup || null
            });
        });

        // 加载激活分组状态
        this.activeGroup = this.context.globalState.get('activeGroup', null);
    }

    /**
     * 保存数据到 VS Code 的全局状态
     * 注意：由于 globalState 只能存储可序列化的数据，
     * 需要将 Map 转换为普通对象/数组
     */
    saveFavorites() {
        // 保存默认分组的文件
        const favoritesArray = Array.from(this.favorites.values());

        // 保存分组数据，将 Map 转换为普通对象
        const groupsObject = {};
        this.groups.forEach((group, groupName) => {
            groupsObject[groupName] = {
                files: Array.from(group.files.values()),
                subGroups: Array.from(group.subGroups.entries()),
                parentGroup: group.parentGroup
            };
        });
        
        // 使用 update 方法保存到全局状态
        this.context.globalState.update('favorites', favoritesArray);
        this.context.globalState.update('favoriteGroups', groupsObject);
        this.context.globalState.update('activeGroup', this.activeGroup);
    }

    /**
     * 创建树视图项，用于显示文件和分组
     * 这是 VS Code TreeDataProvider 接口的核心方法之一
     * 用于定义每个树节点的外观和行为
     * @param {Object} element - 要显示的元素（文件或分组）
     */
    getTreeItem(element) {
        if (element.isGroup) {
            // 处理分组节点
            const group = this.groups.get(element.name);
            const fileCount = group.files.size;
            const subGroupCount = group.subGroups.size;
            
            const isActive = element.name === this.activeGroup;
            // 只在有子分组时显示子分组数量
            const label = subGroupCount > 0 ? 
                `${element.name} (${fileCount} files, ${subGroupCount} groups)` : 
                `${element.name} (${fileCount} files)`;
            
            // 创建分组的树节点
            const treeItem = new vscode.TreeItem(
                label,
                vscode.TreeItemCollapsibleState.Expanded  // 默认展开分组
            );
            // contextValue 用于在 package.json 中的 when 子句中判断节点类型
            treeItem.contextValue = isActive ? 'activeGroup' : 'group';
            
            // 使用不同的图标和颜色来区分激活分组
            treeItem.iconPath = new vscode.ThemeIcon(
                isActive ? 'folder-active' : 'folder-opened',  // 使用不同的文件夹图标
                isActive ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : undefined  // 使用警告色
            );
            
            // 添加分组的操作按钮
            treeItem.buttons = [
                // 激活/取消激活按钮
                {
                    icon: new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline'),
                    tooltip: isActive ? 'Deactivate Group' : 'Set as Active Group',
                    command: {
                        command: isActive ? 'vscode-favorites.deactivateGroup' : 'vscode-favorites.setActiveGroup',
                        arguments: [element],
                        title: isActive ? 'Deactivate Group' : 'Set as Active Group'
                    }
                },
                // 创建子分组按钮
                {
                    icon: new vscode.ThemeIcon('new-folder'),
                    tooltip: 'Create Sub-Group',
                    command: {
                        command: 'vscode-favorites.addNewSubGroup',
                        arguments: [element],
                        title: 'Create Sub-Group'
                    }
                },
                // 重命名按钮
                {
                    icon: new vscode.ThemeIcon('edit'),
                    tooltip: 'Rename Group',
                    command: {
                        command: 'vscode-favorites.renameGroup',
                        arguments: [element],
                        title: 'Rename Group'
                    }
                },
                // 删除按钮
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

        // 处理文件节点
        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        
        if (element.type === 'file') {
            // 设置文件点击时的命令（打开文件）
            treeItem.command = {
                command: 'vscode-favorites.openFavoriteFile',
                arguments: [element],
                title: 'Open File'
            };
            // 设置文件的 URI，用于文件操作和拖拽
            treeItem.resourceUri = vscode.Uri.file(element.path);
        }
        
        // 设置图标
        treeItem.iconPath = element.type === 'folder' ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file');
        treeItem.contextValue = element.type;

        // 为文件添加删除按钮
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

    /**
     * 获取树节点的子项
     * 这是 VS Code TreeDataProvider 接口的另一个核心方法
     * 用于定义树的层级结构
     * @param {Object} element - 父节点元素，如果是 undefined 则表示根节点
     * @returns {Array} 子节点数组
     */
    getChildren(element) {
        if (!element) {
            // 根级别：显示默认收藏和顶级分组
            // 注意：顶级分组是指没有 parentGroup 的分组
            const defaultItems = Array.from(this.favorites.values());
            const topGroups = Array.from(this.groups.entries())
                .filter(([_, group]) => !group.parentGroup)  // 只选择顶级分组
                .map(([name]) => ({
                    name,
                    isGroup: true
                }));
            return [...defaultItems, ...topGroups];
        }
        
        if (element.isGroup) {
            // 如果是分组，显示其文件和子分组
            const group = this.groups.get(element.name);
            if (!group) return [];

            // 获取分组内的文件，并添加分组信息
            const files = Array.from(group.files.values()).map(item => ({
                ...item,
                groupName: element.name,
                contextValue: 'file'  // 用于在 package.json 中的 when 子句判断
            }));
            
            // 获取子分组，并添加父分组信息
            const subGroups = Array.from(group.subGroups.keys()).map(name => ({
                name,
                isGroup: true,
                parentGroup: element.name
            }));

            // 返回文件和子分组的组合
            return [...files, ...subGroups];
        }
        
        // 如果是文件节点，没有子项
        return [];
    }

    addFavorite(uri) {
        const stat = fs.statSync(uri.fsPath);
        const favorite = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file'
        };

        if (this.activeGroup && this.groups.has(this.activeGroup)) {
            favorite.groupName = this.activeGroup;
            this.groups.get(this.activeGroup).files.set(uri.fsPath, favorite);
        } else {
            this.favorites.set(uri.fsPath, favorite);
        }

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

    /**
     * 处理拖拽操作
     * VS Code 的拖拽系统会在拖拽开始时调用此方法
     * @param {Array} items - 被拖拽的项目数组
     * @param {DataTransfer} dataTransfer - VS Code 提供的数据传输对象
     * @param {CancellationToken} token - 用于检测修饰键（如 Cmd/Ctrl）的状态
     */
    async handleDrag(items, dataTransfer, token) {
        console.log('\n=== handleDrag Start ===');
        console.log('Input items:', JSON.stringify(items, null, 2));
        
        try {
            // 设置拖拽数据，包含项目信息和操作类型（复制/移动）
            const dragData = {
                items: items,
                isCopy: false  // 默认为移动操作
            };

            // 检查是否按下了修饰键（Cmd/Ctrl）
            // 在 macOS 上使用 Cmd，在其他平台使用 Ctrl
            if (process.platform === 'darwin') {
                dragData.isCopy = token.isCancellationRequested;
                console.log('macOS: Command key state:', dragData.isCopy);
            } else {
                dragData.isCopy = token.isCancellationRequested;
                console.log('Windows/Linux: Ctrl key state:', dragData.isCopy);
            }

            console.log('Prepared drag data:', JSON.stringify(dragData, null, 2));
            
            // 设置拖拽数据到 DataTransfer 对象
            // 使用自定义的 MIME 类型来标识数据
            const transferItem = new vscode.DataTransferItem(dragData);
            dataTransfer.set('application/vnd.code.tree.favoritesList', transferItem);
            console.log('Set favoritesList data');
            
            // 设置拖拽效果（复制/移动）
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

            // 如果标是分组
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
            // 如目标默认分组区域
            else if (!target) {
                console.log('Dropping into default group');
                for (const source of items) {
                    if (source.type === 'file' && source.groupName) {
                        console.log('Processing file:', source.path);
                        // 创建
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
                    // 更新所项的 groupName
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
            // 建新的空分组，包含完整的数据结构
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

    // 添加一个辅助方法来获取分组的完整路径
    getGroupFullPath(groupName) {
        const group = this.groups.get(groupName);
        if (!group) return groupName;

        let path = groupName;
        let current = group;
        while (current.parentGroup) {
            path = `${current.parentGroup} > ${path}`;
            current = this.groups.get(current.parentGroup);
        }
        return path;
    }

    // 添加一个辅助方法来获取所有分组（包括完整路径）
    getAllGroupsWithPath() {
        const groups = ['(Default Group)'];
        this.groups.forEach((_, groupName) => {
            groups.push(this.getGroupFullPath(groupName));
        });
        return groups;
    }

    async moveToGroup(item, targetGroup) {
        if (!targetGroup) {
            // 获取所有选中的项目
            const selectedItems = item ? 
                [item, ...this.view.selection.filter(i => i !== item)] : 
                this.view.selection;

            console.log('\n### > Selected items for move:', JSON.stringify(selectedItems, null, 2));
            
            if (selectedItems && selectedItems.length > 0) {
                // 准备分组列表，包括默认分组和完整路径
                const groups = this.getAllGroupsWithPath();
                // 排除当前所在分组（如果所有项都在同一个分组）
                const currentGroup = selectedItems[0].groupName;
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = allSameGroup ? 
                    groups.filter(g => !g.endsWith(currentGroup)) : 
                    groups;
                
                // 让用户选择目标分组
                const targetGroupPath = await vscode.window.showQuickPick(availableGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroupPath) {
                    // 从路径获取实际的分组名
                    const targetGroup = targetGroupPath === '(Default Group)' ? 
                        targetGroupPath : 
                        targetGroupPath.split(' > ').pop();

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
                            // 移动指定分组
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
                [item, ...this.view.selection.filter(i => i !== item)] : 
                this.view.selection;

            console.log('\n### > Selected items for copy:', JSON.stringify(selectedItems, null, 2));
            
            if (selectedItems && selectedItems.length > 0) {
                // 准备分组列表包括默认分组和完整路径
                const groups = this.getAllGroupsWithPath();
                // 排除当前所在分组（如果所有项都在同一个分组）
                const currentGroup = selectedItems[0].groupName;
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = allSameGroup ? 
                    groups.filter(g => !g.endsWith(currentGroup)) : 
                    groups;
                
                // 让用户选择目标分组
                const targetGroupPath = await vscode.window.showQuickPick(availableGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroupPath) {
                    // 从路径中获取实际的分组名
                    const targetGroup = targetGroupPath === '(Default Group)' ? 
                        targetGroupPath : 
                        targetGroupPath.split(' > ').pop();

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

    async removeAll() {
        // 检查是否有任何收藏
        if (this.favorites.size === 0 && this.groups.size === 0) {
            vscode.window.showInformationMessage('No favorites to remove.');
            return;
        }

        // 构建确认消息
        let message = 'Are you sure you want to remove all favorites?\n\n';
        
        // 统计默认分组的文件
        if (this.favorites.size > 0) {
            message += `Default Group: ${this.favorites.size} file(s)\n`;
        }

        // 统计每个分组的文件
        this.groups.forEach((group, groupName) => {
            message += `${this.getGroupFullPath(groupName)}: ${group.files.size} file(s)\n`;
        });

        // 显示确认对话框
        const answer = await vscode.window.showWarningMessage(
            message,
            { modal: true, detail: 'This action cannot be undone.' },
            'Remove All'
        );

        if (answer === 'Remove All') {
            // 清空所有收藏
            this.favorites.clear();
            this.groups.clear();
            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
    }

    // 设置激活分组
    setActiveGroup(groupName) {
        this.activeGroup = groupName;
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }
}

/**
 * VS Code 扩展的激活函数
 * 当扩展被激活时（比如第一次使用相关命令时），VS Code 会调用这个函数
 * @param {vscode.ExtensionContext} context - VS Code 提供的扩展上下文
 */
function activate(context) {
    // 创建收藏夹提供者实例
    const favoritesProvider = new FavoritesProvider(context);
    
    /**
     * 创建树视图
     * treeDataProvider: 提供树视图数据的对象
     * canSelectMany: 是否允许多选
     * dragAndDropController: 处理拖放操作的控制器
     *   - dropMimeTypes: 可以接受的数据类型
     *   - dragMimeTypes: 可以提供的数据类型
     *   - handleDrag/handleDrop: 处理拖放的回调函数
     */
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
    
    // 将 TreeView 实例传给 Provider，用于获取选中项等信息
    favoritesProvider.setTreeView(treeView);

    /**
     * 注册添加到收藏夹的命令
     * uri: 单个文件的 URI
     * uris: 多个文件的 URI 数组（多选时）
     * 如果都为空，则使用当前活动编辑器的文件
     */
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

    /**
     * 注册从收藏夹移除的命令
     * item: 要移除的项目
     * 如果是从按钮点击，只移除该项
     * 如果是从右键菜单，处理所有选中项
     */
    let removeFromFavorites = vscode.commands.registerCommand('vscode-favorites.removeFromFavorites', async (item) => {
        // 获取所有选中的项目
        const selectedItems = item ? 
            [item, ...treeView.selection.filter(i => i !== item)] : 
            treeView.selection;

        console.log('\n### > Selected items for removal:', JSON.stringify(selectedItems, null, 2));
        
        if (selectedItems && selectedItems.length > 0) {
            let message;
            if (selectedItems.length === 1) {
                const item = selectedItems[0];
                const itemDesc = item.groupName ? 
                    `"${item.name}" from group "${favoritesProvider.getGroupFullPath(item.groupName)}"` : 
                    `"${item.name}"`;
                message = `Are you sure you want to remove ${itemDesc} from favorites?`;
            } else {
                // 按组分类文件
                const groupedFiles = new Map();
                selectedItems.forEach(item => {
                    const groupName = item.groupName ? 
                        favoritesProvider.getGroupFullPath(item.groupName) : 
                        '(Default Group)';
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

    /**
     * 注册打开收藏文件的命令
     * 支持三种方式：
     * 1. openFavoriteFiles: 打开所有选中的文件
     * 2. openSelectedFiles: 打开选中的文件（别名）
     * 3. openFavoriteFile: 打开单个文件
     */
    let openFavoriteFiles = vscode.commands.registerCommand('vscode-favorites.openFavoriteFiles', async () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        for (const item of selectedItems) {
            if (item.type === 'file') {
                // 使用 VS Code 的内置命令打开文件
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
            // 如果只提供了一 URI，添加单个文件
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

    // 注册添加子分组的命令
    let addNewSubGroup = vscode.commands.registerCommand('vscode-favorites.addNewSubGroup', async (parentGroup) => {
        // 直接使用现有的 addNewGroup 方法，因为它已经支持父分组
        await favoritesProvider.addNewGroup(parentGroup);
    });

    // 注册删除所有收藏的命令
    let removeAll = vscode.commands.registerCommand('vscode-favorites.removeAll', async () => {
        await favoritesProvider.removeAll();
    });

    // 注册设置激活分组的命令
    let setActiveGroup = vscode.commands.registerCommand('vscode-favorites.setActiveGroup', async (groupElement) => {
        favoritesProvider.setActiveGroup(groupElement.name);
    });

    // 注册取消激活分组的命令
    let deactivateGroup = vscode.commands.registerCommand('vscode-favorites.deactivateGroup', async () => {
        favoritesProvider.setActiveGroup(null);
    });

    /**
     * 将所有注册的命令和视图添加到订阅列表
     * 这样在扩展停用时，VS Code 会自动清理这些资源
     */
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
        copyToGroup,
        addNewSubGroup,
        removeAll,
        setActiveGroup,
        deactivateGroup
    );
}

/**
 * VS Code 扩展的停用函数
 * 当扩展被停用时，VS Code 会调用这个函数
 * 由于我们使用了 subscriptions，不需要在这里做额外的清理
 */
function deactivate() {}

// 导出激活和停用函数
module.exports = {
    activate,
    deactivate
} 