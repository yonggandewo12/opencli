.PHONY: all clean

DYLIB = cdp_enabler.dylib

all: $(DYLIB)

SDK_PATH := $(shell xcrun --sdk macosx --show-sdk-path 2>/dev/null || echo /Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk)

$(DYLIB): cdp_enabler.c
	clang -dynamiclib -arch arm64 -arch arm64e -isysroot $(SDK_PATH) -o $@ $< \
		-framework CoreFoundation \
		-lpthread \
		-Wno-deprecated-declarations

clean:
	rm -f $(DYLIB)
