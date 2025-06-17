/*\
title: $:/plugins/jerojasro/mjscalc/widgets/CalTex
type: application/javascript
module-type: widget

Widget for evaluating math expressions and rendering them as text or LaTeX via KaTeX

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var math = require("$:/plugins/jerojasro/mjscalc/libraries/math.js");

math.import({linreg: function(Y, X) {
    var sumx = math.sum(X);
    var sumy = math.sum(Y);
    var sumxy = math.sum(math.dotMultiply(X, Y));
    var sumx2 = math.sum(math.dotMultiply(X, X));
    var n = math.count(X);

    var D = math.det([[sumx2, sumx], [sumx, n]]);

    var m = math.det([[sumxy, sumx], [sumy, n]]) / D;
    var b = math.det([[sumx2, sumxy], [sumx, sumy]]) / D;
    return math.matrix([m, b]);
}})

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var CalTexWidget = function(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
};
CalTexWidget.prototype = new Widget();

CalTexWidget.prototype.renderErrorMessage = function(errorMessage, parent, nextSibling) {
    if (!this.verbose) {
        return;
    }

    var textNode = this.document.createTextNode(errorMessage);
    parent.insertBefore(textNode, nextSibling);
    this.domNodes.push(textNode);
    return;
}

function removeTrailingZeroes(numStr) {
    var i = numStr.length - 1;
    while (i > 0 && numStr[i] == "0") i = i - 1;

    if (numStr[i] == ".") i = i - 1;

    return numStr.substring(0, i + 1);
}

function katexSciNot(n) {
    var s = n.toExponential(3);
    var tokens = s.split("e");
    if (tokens[1][0] == "+") {
        tokens[1] = tokens[1].substring(1);
    }
    return removeTrailingZeroes(tokens[0]) + "\\!\\times\\! 10^{" + tokens[1] + "}";
}

function katexNumber(n) {
    if (n == 0) return "0";

    if (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4) return katexSciNot(n);

    return removeTrailingZeroes(n.toFixed(6));
}

function katexNumNodeHandler(node, options) {
    if (node.type == 'ConstantNode') {
        return katexNumber(node.value);
    }
}

function katexArray(arr) {
    return "\\begin{bmatrix}" + arr.map(katexNumber).join("\\\\") + "\\end{bmatrix}"
}

function resultToKatex(result) {
    if (typeof result == "number") {
        return katexNumber(result);
    }

    // TODO this is brittle but I don't see other way of detecting when
    // something is an array
    if (typeof result == "object" && result._data) {
        return katexArray(result._data);
    }
    return result.toString();
}

CalTexWidget.prototype.toTex = function(mathNode, result) {
    if (this.isSimpleAssignment(mathNode)) {
        return mathNode.toTex({handler: katexNumNodeHandler});
    }
    return mathNode.toTex({handler: katexNumNodeHandler}) + " = " + resultToKatex(result);
}

CalTexWidget.prototype.isSimpleAssignment = function(mathNode) {
    return (
        mathNode.type == "BlockNode" ||
        mathNode.type == "FunctionAssignmentNode" ||
        mathNode.type == "AssignmentNode" &&
        (
            mathNode.value.type == "ConstantNode" ||
            mathNode.value.type == "ArrayNode"
        )
    );
}

CalTexWidget.prototype.mathjsTiddlerScope = function() {
    var tiddlerWidget;
    var self = this;
    while (self) {
        if (self.transcludeTitle && self.transcludeTitle == "$:/core/ui/ViewTemplate/body/default") {
            tiddlerWidget = self;
            break;
        }
        self = self.parentWidget;
    }

    if (! tiddlerWidget.mathjsScope) {
        tiddlerWidget.mathjsScope = {};
    }
    return tiddlerWidget.mathjsScope;
}

/*
Add elements to the DOM
*/
CalTexWidget.prototype.render = function(parent, nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();

    this.inline = this.getAttribute("$inline", "yes") == "yes";
    this.verbose = !(this.getAttribute("$verbose", "yes") == "no");

    var expText = getExpressionText(this.parseTreeNode.children);
    if (!expText) return;
    expText = expText.trim();
    if (!expText) return;

    var mathNode;
    var result;
    try {
        mathNode = math.parse(expText);
        result = mathNode.compile().evaluate(this.mathjsTiddlerScope());
    } catch(err) {
        return this.renderErrorMessage("Unable to parse '" + expText + "': " + err, parent, nextSibling);
    }
    return this._render(mathNode, result, parent, nextSibling);
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
CalTexWidget.prototype.refresh = function(changedTiddlers) {
    if (this.refreshChildren(changedTiddlers)) {
        this.refreshSelf();
        return true;
    }
    return false;
};

function getExpressionText(parseTreeNodeChildren) {
    const textWidgets = parseTreeNodeChildren.filter((w) => w.type == "text");

    if ($tw.utils.count(textWidgets) == 0) return "";

    return textWidgets[0].text;
}


CalTexWidget.prototype._render = function(mathNode, result, parent, nextSibling) {
    var katexResult = this.toTex(mathNode, result);

    var displayMode = "true";
    if (this.inline) displayMode = "false";

    var katexParseTreeNode = {
        "tag": "$katex",
        "type": "katex",
        "attributes": {
            "text": {"name": "text", "type": "string", "value": katexResult},
            "displayMode": {"name": "text", "type": "string", "value": displayMode}
        }
    };
    this.makeChildWidgets([katexParseTreeNode]);
    this.renderChildren(parent, nextSibling);

    return;
};

exports.caltex = CalTexWidget;

})();
