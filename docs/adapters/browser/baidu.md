# Baidu

**Mode**: 🔐 Browser · **Domain**: `baidu.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli baidu search` | 百度搜索 |
| `opencli baidu hot` | 百度热搜榜 |

## Usage Examples

```bash
# 搜索关键词
opencli baidu search Claude Code --limit 10

# 获取热搜榜
opencli baidu hot --limit 10

# JSON 输出
opencli baidu search 兴业银行 -f json

# Verbose 模式
opencli baidu hot -v
```

## Prerequisites

- Chrome running and **logged into** baidu.com
- [Browser Bridge extension](/guide/browser-bridge) installed

## Notes

- `search`: 通过浏览器导航到百度搜索页面并提取结果
- `hot`: 访问百度热搜榜 (top.baidu.com) 获取实时热搜内容
