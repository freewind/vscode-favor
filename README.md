# VS Code Favor Files

一个帮助你管理常用文件的 VS Code 扩展。支持分组、嵌套分组等功能。

主要目的是为了收藏文件，方便添加到cursor chat/composer里，或者生成AI友好的文件格式添加过去。

## 功能特点

### 基本功能
- 将文件添加到收藏夹
- 支持文件分组管理
- 支持嵌套分组（子分组）
- 支持多选操作
- 支持撤销操作（最近的50个操作）
- 支持从剪贴板批量添加文件
- 支持生成AI友好的文件格式

### 分组管理
- 创建、重命名、删除分组
- 在分组内创建子分组
- 设置激活分组（新收藏的文件会自动添加到激活分组）
- 在分组间移动/复制文件

### 操作方式
- 右键菜单：在文件资源管理器中右键选择 "Add to Favorites" 或 "Add to Favorite Group"
- 多选：支持选择多个文件进行批量操作
- 快捷按钮：每个项目右侧都有相应的快捷操作按钮
- 撤销：点击工具栏的撤销按钮可以撤销最近的操作
- 剪贴板：支持从剪贴板文本批量导入文件路径
- AI支持：可以将选中的文件内容导出为AI友好的格式

## 使用说明

### 添加文件到收藏夹
1. 在文件资源管理器中右键点击文件
2. 选择 "Add to Favorites" 将文件添加到默认分组或激活分组
3. 或选择 "Add to Favorite Group" 选择特定分组
4. 也可以复制文件路径到剪贴板，然后右键点击分组选择 "Add Files from Clipboard"

### 分组操作
1. 点击收藏夹视图右上角的 "+" 按钮创建新分组
2. 点击分组右侧的按钮进行：
   - 设置/取消激活分组
   - 创建子分组
   - 重命名分组
   - 删除分组

### 文件操作
1. 点击文件右侧的按钮进行：
   - 移动到其他分组
   - 复制到其他分组
   - 从收藏夹移除
2. 选中文件或分组后，可以点击 "Generate File for AI" 生成AI友好的文件格式

## 注意事项

1. 删除分组时有两个选项：
   - 删除分组及其所有文件
   - 将文件移动到默认分组并删除分组

2. 激活分组功能：
   - 同时只能有一个激活分组
   - 使用 "Add to Favorites" 时，文件会自动添加到激活分组
   - 如果没有激活分组，文件会添加到默认分组

3. 多选操作：
   - 可以同时选择多个文件进行移动、复制或删除
   - 在确认对话框中会显示所有选中的文件

4. 数据存储：
   - 收藏夹数据保存在 VS Code 的全局存储中
   - 重启 VS Code 后数据仍然保留

5. 撤销功能：
   - 支持撤销最近的50个操作
   - 每次撤销前会显示确认对话框
   - 可以撤销的操作包括：删除文件、删除所有、移动文件、复制文件、删除分组等

6. 从剪贴板添加文件：
   - 支持一次性添加多个文件路径
   - 自动过滤无效的文件路径
   - 显示添加成功和失败的数量

7. 生成AI友好文件：
   - 在项目根目录生成带时间戳的文件
   - 包含所有选中文件的路径和内容
   - 使用XML格式标记文件内容
   - 方便复制到AI对话中使用

## 快捷键

暂无预设快捷键，用户可以在 VS Code 的键盘快捷方式设置中自定义绑定。

## 问题反馈

如果你发现任何问题或有功能建议，请在 GitHub 仓库中提交 issue。

## License

MIT
