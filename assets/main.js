(()=>{document.currentScript.remove();processNode(document);function processNode(node){node.querySelectorAll(&amp;quot;template[shadowrootmode]&amp;quot;).forEach(element=>{let shadowRoot = element.parentElement.shadowRoot;if (!shadowRoot) {try {shadowRoot=element.parentElement.attachShadow({mode:element.getAttribute(&amp;quot;shadowrootmode&amp;quot;),delegatesFocus:element.getAttribute(&amp;quot;shadowrootdelegatesfocus&amp;quot;)!=null,clonable:element.getAttribute(&amp;quot;shadowrootclonable&amp;quot;)!=null,serializable:element.getAttribute(&amp;quot;shadowrootserializable&amp;quot;)!=null});shadowRoot.innerHTML=element.innerHTML;element.remove()} catch (error) {} if (shadowRoot) {processNode(shadowRoot)}}})}})()

(()=>{document.currentScript.remove();processNode(document);function processNode(node){node.querySelectorAll(&quot;template[shadowrootmode]&quot;).forEach(element=>{let shadowRoot = element.parentElement.shadowRoot;if (!shadowRoot) {try {shadowRoot=element.parentElement.attachShadow({mode:element.getAttribute(&quot;shadowrootmode&quot;),delegatesFocus:element.getAttribute(&quot;shadowrootdelegatesfocus&quot;)!=null,clonable:element.getAttribute(&quot;shadowrootclonable&quot;)!=null,serializable:element.getAttribute(&quot;shadowrootserializable&quot;)!=null});shadowRoot.innerHTML=element.innerHTML;element.remove()} catch (error) {} if (shadowRoot) {processNode(shadowRoot)}}})}})()


        (() => {
            document.currentScript.remove();
            processNode(document);

            function processNode(node) {
                node.querySelectorAll("template[shadowrootmode]").forEach(element => {
                    let shadowRoot = element.parentElement.shadowRoot;
                    if (!shadowRoot) {
                        try {
                            shadowRoot = element.parentElement.attachShadow({
                                mode: element.getAttribute("shadowrootmode"),
                                delegatesFocus: element.getAttribute("shadowrootdelegatesfocus") != null,
                                clonable: element.getAttribute("shadowrootclonable") != null,
                                serializable: element.getAttribute("shadowrootserializable") != null
                            });
                            shadowRoot.innerHTML = element.innerHTML;
                            element.remove()
                        } catch (error) {}
                        if (shadowRoot) {
                            processNode(shadowRoot)
                        }
                    }
                })
            }
        })()
    

