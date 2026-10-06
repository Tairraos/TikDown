//! `--progress-template` 输出的解析。tab 分隔机器格式，上游改文案不影响这里。
use super::args::{PROGRESS_PREFIX, PROGRESS_TEMPLATE};
use super::TaskEvent;

/// 解析一行进度输出：
/// `download:<status>\t<downloaded>\t<total>\t<estimate>\t<speed>\t<eta>\t<filename>`
pub fn parse(line: &str) -> Option<TaskEvent> {
    let rest = line.strip_prefix(PROGRESS_PREFIX)?;
    if rest.starts_with("finished") {
        return None;
    }
    let f: Vec<&str> = rest.split('\t').collect();
    if f.len() < 7 {
        return None;
    }

    let num = |s: &str| s.parse::<u64>().unwrap_or(0);
    let downloaded = num(f[1]);
    // total 缺失时退到估算值，两者都没有才算真的不知道总量
    let total = {
        let t = num(f[2]);
        if t > 0 { t } else { num(f[3]) }
    };

    let speed_bps: f64 = f[4].parse().unwrap_or(0.0);
    let speed = if speed_bps > 0.0 {
        format!("{:.1} MB/s", speed_bps / 1_048_576.0)
    } else {
        String::new()
    };

    let eta = f[5]
        .parse::<u64>()
        .ok()
        .map(|s| {
            let m = s / 60;
            if m > 0 { format!("{}分{}秒", m, s % 60) } else { format!("{}秒", s) }
        })
        .unwrap_or_default();

    let filename = f[6].rsplit('/').next().unwrap_or("").to_string();
    let percent = if total > 0 { downloaded as f64 / total as f64 * 100.0 } else { 0.0 };

    Some(TaskEvent::Progress { percent, downloaded, total, speed, eta, filename })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tab_separated_fields() {
        let line = "download:downloading\t1048576\t10485760\t10485760\t2097152\t5\thttps://x/f.mp4";
        match parse(line) {
            Some(TaskEvent::Progress { percent, downloaded, total, speed, eta, filename }) => {
                assert!((percent - 10.0).abs() < 0.01);
                assert_eq!(downloaded, 1_048_576);
                assert_eq!(total, 10_485_760);
                assert_eq!(speed, "2.0 MB/s");
                assert_eq!(eta, "5秒");
                assert_eq!(filename, "f.mp4");
            }
            other => panic!("应解析为 Progress,得到 {other:?}"),
        }
    }

    #[test]
    fn total_falls_back_to_estimate() {
        let line = "download:downloading\tNA\tNA\t200\tNA\tNA\tf.mp4";
        match parse(line) {
            Some(TaskEvent::Progress { downloaded, total, .. }) => {
                assert_eq!(downloaded, 0); // NA 解析失败按 0 处理
                assert_eq!(total, 200); // 估算值兜底
            }
            other => panic!("应解析为 Progress,得到 {other:?}"),
        }
    }

    #[test]
    fn non_progress_lines_are_ignored() {
        assert!(parse("[download] Destination: x").is_none());
        assert!(parse("download:finished\t1\t1\t1\t1\t1\tf.mp4").is_none());
    }

    /// 模板与解析的前缀必须一致——改了模板没改解析器时这里先红。
    #[test]
    fn template_starts_with_progress_prefix() {
        assert!(PROGRESS_TEMPLATE.starts_with(PROGRESS_PREFIX));
    }
}
