"""Minimal anthropic stub for test environments without the real SDK."""


class Anthropic:
    def __init__(self, *a, **kw):
        pass

    class messages:
        @staticmethod
        def create(*a, **kw):
            raise NotImplementedError("anthropic stub")


class AsyncAnthropic:
    def __init__(self, *a, **kw):
        pass

    class messages:
        @staticmethod
        async def create(*a, **kw):
            raise NotImplementedError("anthropic async stub")
