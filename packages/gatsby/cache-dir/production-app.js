if (__POLYFILL__) {
  require(`core-js/modules/es6.promise`)
}
import { apiRunner, apiRunnerAsync } from "./api-runner-browser"
import React, { createElement } from "react"
import ReactDOM from "react-dom"
import { Router, Route, withRouter, matchPath } from "react-router-dom"
import { ScrollContext } from "gatsby-react-router-scroll"
import createHistory from "history/createBrowserHistory"
import domReady from "domready"
import emitter from "./emitter"
window.___emitter = emitter
import pages from "./pages.json"
import ComponentRenderer from "./component-renderer"
import asyncRequires from "./async-requires"
import loader from "./loader"
loader.addPagesArray(pages)
loader.addProdRequires(asyncRequires)
window.asyncRequires = asyncRequires
window.___loader = loader
window.matchPath = matchPath

// Let the site/plugins run code very early.
apiRunnerAsync(`onClientEntry`).then(() => {
  // Let plugins register a service worker. The plugin just needs
  // to return true.
  if (apiRunner(`registerServiceWorker`).length > 0) {
    require(`./register-service-worker`)
  }

  const navigateTo = pathname => {
    // If we're already at this path, do nothing.
    if (window.location.pathname === pathname) {
      return
    }

    // Listen to loading events. If page resources load before
    // a second, navigate immediately.
    function eventHandler(e) {
      if (e.page.path === loader.getPage(pathname).path) {
        emitter.off(`onPostLoadPageResources`, eventHandler)
        clearTimeout(timeoutId)
        window.___history.push(pathname)
      }
    }

    // Start a timer to wait for a second before transitioning and showing a
    // loader in case resources aren't around yet.
    const timeoutId = setTimeout(() => {
      emitter.off(`onPostLoadPageResources`, eventHandler)
      emitter.emit(`onDelayedLoadPageResources`, { pathname })
      window.___history.push(pathname)
    }, 1000)

    if (loader.getResourcesForPathname(pathname)) {
      // The resources are already loaded so off we go.
      clearTimeout(timeoutId)
      window.___history.push(pathname)
    } else {
      // They're not loaded yet so let's add a listener for when
      // they finish loading.
      emitter.on(`onPostLoadPageResources`, eventHandler)
    }
  }

  // window.___loadScriptsForPath = loadScriptsForPath
  window.___navigateTo = navigateTo

  const history = createHistory()

  // Call onRouteUpdate on the initial page load.
  apiRunner(`onRouteUpdate`, {
    location: history.location,
    action: history.action,
  })

  function attachToHistory(history) {
    if (!window.___history) {
      window.___history = history

      history.listen((location, action) => {
        apiRunner(`onRouteUpdate`, { location, action })
      })
    }
  }

  function shouldUpdateScroll(prevRouterProps, { location: { pathname } }) {
    const results = apiRunner(`shouldUpdateScroll`, {
      prevRouterProps,
      pathname,
    })
    if (results.length > 0) {
      return results[0]
    }

    if (prevRouterProps) {
      const { location: { pathname: oldPathname } } = prevRouterProps
      if (oldPathname === pathname) {
        return false
      }
    }
    return true
  }

  const AltRouter = apiRunner(`replaceRouterComponent`, { history })[0]
  const DefaultRouter = ({ children }) => (
    <Router history={history}>{children}</Router>
  )

  loader.getResourcesForPathname(window.location.pathname, () => {
    const Root = () =>
      createElement(
        AltRouter ? AltRouter : DefaultRouter,
        null,
        createElement(
          ScrollContext,
          { shouldUpdateScroll },
          createElement(withRouter(ComponentRenderer), {
            layout: true,
            children: layoutProps =>
              createElement(Route, {
                render: routeProps => {
                  attachToHistory(routeProps.history)
                  const props = layoutProps ? layoutProps : routeProps

                  if (loader.getPage(props.location.pathname)) {
                    const pageResources = loader.getResourcesForPathname(
                      props.location.pathname
                    )
                    let templateIndex = 0
                    let componentArray = pageResources.components
                    return NestedTemplates(componentArray, templateIndex, props, pageResources)
                  } else {
                    return createElement(ComponentRenderer, {
                      location: { page: true, pathname: `/404.html` },
                    })
                  }
                },
              }),
          })
        )
      )

    const NestedTemplates = (componentArray, templateIndex, props, pageResources) => {
      if (componentArray[templateIndex + 1]) {
        // if this is not the last component in the array,
        //  we will have children
        return createElement(ComponentRenderer, {
          page: true,
          ...props,
          pageResources,
          component: {
            componentIndex: templateIndex,
            componentRender: componentArray[templateIndex],
            componentChunkName: pageResources.page.componentChunkName[templateIndex],
          },
          children: routeProps => NestedTemplates(componentArray, templateIndex + 1, props, pageResources)
        })
      } else {
        // if this is last in the array, we need to render
        return createElement(Route, {
          render: routeProps => {
            return createElement(ComponentRenderer, {
              page: true,
              ...props,
              pageResources,
              component: {
                componentIndex: templateIndex,
                componentRender: componentArray[templateIndex],
                componentChunkName: pageResources.page.componentChunkName[templateIndex],
              },
            })
          }
        })
      }
    }

    const NewRoot = apiRunner(`wrapRootComponent`, { Root }, Root)[0]
    domReady(() =>
      ReactDOM.render(
        <NewRoot />,
        typeof window !== `undefined`
          ? document.getElementById(`___gatsby`)
          : void 0,
        () => {
          apiRunner(`onInitialClientRender`)
        }
      )
    )
  })
})
