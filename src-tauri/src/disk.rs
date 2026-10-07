//! 下载目录所在卷的剩余空间查询（fs4 statvfs）。
//! 叶子模块：无 crate 内依赖、无子进程，纯系统调用封装。

use std::path::Path;

/// 目录所在卷的剩余可用字节数。路径不存在或平台查询失败时返回 Err，
/// 由前端显示占位符而不是让界面报错。
pub fn free_space(path: &Path) -> Result<u64, String> {
    fs4::statvfs(path)
        .map(|s| s.free_space())
        .map_err(|e| format!("查询剩余空间失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 真实目录剩余空间为正数() {
        let n = free_space(&std::env::temp_dir()).expect("tmp 目录应可查询");
        assert!(n > 0);
    }

    #[test]
    fn 不存在的路径返回错误() {
        let p = std::path::Path::new("/nonexistent-tikdown-diskfree-9x7y/zzz");
        assert!(free_space(p).is_err());
    }
}
