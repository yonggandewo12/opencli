/**
 * cdp_enabler.c — DYLD-injected library to enable CDP remote debugging
 * in Feishu/Lark desktop app.
 *
 * Strategy v4:
 * 1. Only activate in the MAIN browser process (not helper/renderer/GPU)
 * 2. Repeatedly poll for FacadeStartDevtoolsWithHandler in loaded images
 * 3. Once found, call it on the main queue to enable CDP
 *
 * Usage:
 *   CDP_PORT=9222 DYLD_INSERT_LIBRARIES=./cdp_enabler.dylib \
 *     /Applications/Lark.app/Contents/MacOS/Feishu
 */

#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <mach-o/dyld.h>
#include <dispatch/dispatch.h>

typedef int (*FacadeStartDevtoolsFn)(int port, void *handler);

static int g_cdp_port = 9222;

static int is_main_process(void) {
    extern int *_NSGetArgc(void);
    extern char ***_NSGetArgv(void);
    
    int argc = *_NSGetArgc();
    char **argv = *_NSGetArgv();
    
    for (int i = 1; i < argc; i++) {
        if (strncmp(argv[i], "--type=", 7) == 0) return 0;
        if (strncmp(argv[i], "--aha-process-t=", 16) == 0) return 0;
    }
    return 1;
}

/*
 * Search for FacadeStartDevtoolsWithHandler across all loaded Mach-O images.
 * The Feishu binary dlopen()s the Lark Framework dynamically, so we need to
 * iterate loaded images and dlsym on each one.
 */
static void *find_facade_devtools(void) {
    // First try the global symbol namespace
    void *func = dlsym(RTLD_DEFAULT, "FacadeStartDevtoolsWithHandler");
    if (func) return func;
    
    // Iterate all loaded images to find Lark Framework
    uint32_t count = _dyld_image_count();
    for (uint32_t i = 0; i < count; i++) {
        const char *name = _dyld_get_image_name(i);
        if (name && strstr(name, "Lark Framework")) {
            fprintf(stderr, "[cdp_enabler] Found Lark Framework at image %u: %s\n", i, name);
            void *handle = dlopen(name, RTLD_NOW | RTLD_NOLOAD);
            if (handle) {
                func = dlsym(handle, "FacadeStartDevtoolsWithHandler");
                if (func) {
                    fprintf(stderr, "[cdp_enabler] Found symbol at %p\n", func);
                    return func;
                }
                fprintf(stderr, "[cdp_enabler] Image loaded but symbol not found\n");
            } else {
                fprintf(stderr, "[cdp_enabler] dlopen(NOLOAD) failed: %s\n", dlerror());
            }
        }
    }
    return NULL;
}

static void poll_and_start(void);

static void poll_and_start(void) {
    static int attempts = 0;
    attempts++;
    
    void *func = find_facade_devtools();
    if (!func) {
        if (attempts < 30) {
            // Retry in 1 second
            fprintf(stderr, "[cdp_enabler] Attempt %d: symbol not found yet, retrying...\n", attempts);
            dispatch_after(
                dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC),
                dispatch_get_main_queue(),
                ^{ poll_and_start(); }
            );
        } else {
            fprintf(stderr, "[cdp_enabler] Gave up after %d attempts\n", attempts);
        }
        return;
    }
    
    fprintf(stderr, "[cdp_enabler] 🎯 Calling FacadeStartDevtoolsWithHandler(%d, NULL)\n", g_cdp_port);
    
    FacadeStartDevtoolsFn fn = (FacadeStartDevtoolsFn)func;
    int result = fn(g_cdp_port, NULL);
    
    fprintf(stderr, "[cdp_enabler] Result: %d\n", result);
    fprintf(stderr, "[cdp_enabler] Check: curl http://127.0.0.1:%d/json/version\n", g_cdp_port);
}

__attribute__((constructor))
static void cdp_enabler_init(void) {
    if (!is_main_process()) return;
    
    const char *port_env = getenv("CDP_PORT");
    if (port_env) g_cdp_port = atoi(port_env);
    if (g_cdp_port <= 0) g_cdp_port = 9222;
    
    fprintf(stderr, "[cdp_enabler] Main process detected! "
                    "Polling for Lark Framework symbols (port %d)\n", g_cdp_port);
    
    // Start polling after 3 seconds (give framework time to load)
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC),
        dispatch_get_main_queue(),
        ^{ poll_and_start(); }
    );
}
