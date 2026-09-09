"""后端用户文案（gui.i18n.msg）。"""

from boss_zhipin.gui import i18n


def test_returns_zh_message():
    assert i18n.msg("err.need_name") == "请先在「运行」页填写你的名字（招呼语署名用）"


def test_var_substitution():
    assert i18n.msg("err.need_name", ignored="/tmp/x.pdf") == "请先在「运行」页填写你的名字（招呼语署名用）"


def test_unknown_key_returns_key_itself():
    # 漏翻的 key 回退成 key 本身——开发期一眼可见，运行期不抛异常
    assert i18n.msg("nope.not.a.key") == "nope.not.a.key"
